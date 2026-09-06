import json
import runpy
import shutil

import anyio
import httpx
import pytest

from .conftest import login


REPAIR_INPUT = {"description": "厨房水管漏水，请帮我整理报修说明"}
REPAIR_DRAFT = {
    "category": "水电维修",
    "description": "厨房水管出现漏水，需要检查维修。",
    "priority": "NORMAL",
    "missingInfo": ["请补充漏水的具体位置及严重程度"],
}
NOTICE_INPUT = {"title": "停水通知", "content": "本周五上午九点至十一点，三号楼检修水管暂停供水。"}
NOTICE_DRAFT = {
    "title": "三号楼停水检修通知",
    "content": "三号楼将于本周五上午九点至十一点进行水管检修，期间暂停供水，请提前做好准备。",
    "missingInfo": ["请补充本周五的具体日期"],
}


@pytest.fixture(autouse=True)
def ai_environment(monkeypatch):
    for name, value in {
        "ENABLED": "false",
        "BASE_URL": "",
        "MODEL": "",
        "API_KEY": "",
        "TIMEOUT_SECONDS": "30",
    }.items():
        monkeypatch.setenv(f"COMMUNITY_AI_{name}", value)

    async def forbid_network(self, request):
        raise AssertionError(f"Unexpected outgoing AI request to {request.url.host}")

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", forbid_network)


@pytest.fixture
def provider(client, monkeypatch):
    settings = client.app.state.settings
    settings.ai_enabled = True
    settings.ai_base_url = "https://model.example/v1/"
    settings.ai_model = "test-model"
    settings.ai_api_key = type(settings.ai_api_key)("provider-secret-never-return")
    state = {"draft": REPAIR_DRAFT, "status": 200, "requests": [], "failure": None}

    def respond(request):
        state["requests"].append(request)
        if state["failure"]:
            raise state["failure"]
        body = state.get("body", {
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": json.dumps(state["draft"], ensure_ascii=False)},
                "finish_reason": "stop",
            }],
        })
        return httpx.Response(
            state["status"], json=body,
            headers={"Location": "https://redirected.example/v1/chat/completions"},
        )

    transport = httpx.MockTransport(respond)

    async def handle_request(self, request):
        return await transport.handle_async_request(request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle_request)
    return state


def test_disabled_ai_returns_available_manual_workflow_error(client):
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 503
    assert response.json()["code"] == "AI_NOT_CONFIGURED"
    assert response.json()["requestId"]
    assert "手动" in response.json()["message"]


def test_configuration_is_loaded_from_backend_directory_when_working_elsewhere(tmp_path, monkeypatch):
    from app.core import config

    relocated_module = tmp_path / "backend" / "app" / "core" / "config.py"
    relocated_module.parent.mkdir(parents=True)
    shutil.copyfile(config.__file__, relocated_module)
    (tmp_path / "backend" / ".env").write_text("COMMUNITY_AI_MODEL=example-local-model\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("COMMUNITY_AI_MODEL")
    settings_type = runpy.run_path(str(relocated_module))["Settings"]
    assert settings_type().ai_model == "example-local-model"


@pytest.mark.parametrize("task, username, payload, draft, records", [
    ("repair-draft", "owner", REPAIR_INPUT, REPAIR_DRAFT, "repairs"),
    ("notice-draft", "property", NOTICE_INPUT, NOTICE_DRAFT, "notices"),
])
def test_draft_uses_only_submitted_text_and_does_not_create_records(client, provider, task, username, payload, draft, records):
    headers = login(client, username)
    before = client.get(f"/api/v1/{records}", headers=headers).json()["data"]
    provider["draft"] = draft
    response = client.post(f"/api/v1/ai/{task}", headers={**headers, "X-Request-Id": "draft-test"}, json=payload)
    assert response.status_code == 200
    assert response.json() == {"data": draft, "requestId": "draft-test"}
    assert client.get(f"/api/v1/{records}", headers=headers).json()["data"] == before
    outgoing = provider["requests"][0]
    assert str(outgoing.url) == "https://model.example/v1/chat/completions"
    assert outgoing.method == "POST"
    assert outgoing.headers["Authorization"] == "Bearer provider-secret-never-return"
    assert outgoing.extensions["timeout"]["read"] == 30
    assert headers["Authorization"] not in outgoing.content.decode()
    body = json.loads(outgoing.content)
    assert set(body) == {"model", "messages", "response_format", "temperature", "max_tokens"}
    assert body["model"] == "test-model"
    assert body["response_format"] == {"type": "json_object"}
    assert 0 <= body["temperature"] <= 0.3
    assert 100 <= body["max_tokens"] <= 4096
    assert len(body["messages"]) == 2
    assert body["messages"][0]["role"] == "system"
    assert body["messages"][1]["role"] == "user"
    assert json.loads(body["messages"][1]["content"]) == payload


@pytest.mark.parametrize("task, username, payload", [
    ("repair-draft", "property", REPAIR_INPUT),
    ("repair-draft", "maintenance", REPAIR_INPUT),
    ("notice-draft", "owner", NOTICE_INPUT),
    ("notice-draft", "maintenance", NOTICE_INPUT),
])
def test_wrong_role_is_denied_before_provider_request(client, provider, task, username, payload):
    response = client.post(f"/api/v1/ai/{task}", headers=login(client, username), json=payload)
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"
    assert provider["requests"] == []


def test_unauthenticated_request_is_denied_before_provider_request(client, provider):
    response = client.post("/api/v1/ai/repair-draft", json=REPAIR_INPUT)
    assert response.status_code == 401
    assert provider["requests"] == []


@pytest.mark.parametrize("task, username, payload", [
    ("repair-draft", "owner", {"description": "   "}),
    ("repair-draft", "owner", {"description": "短句"}),
    ("repair-draft", "owner", {"description": "长" * 501}),
    ("repair-draft", "owner", {**REPAIR_INPUT, "houseId": 1}),
    ("notice-draft", "property", {"title": "标题", "content": "   "}),
    ("notice-draft", "property", {"title": "长" * 161, "content": "公告详细内容"}),
    ("notice-draft", "property", {"title": "标题", "content": "长" * 4001}),
])
def test_invalid_user_input_is_rejected_before_provider_request(client, provider, task, username, payload):
    response = client.post(f"/api/v1/ai/{task}", headers=login(client, username), json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
    assert provider["requests"] == []


@pytest.mark.parametrize("field, value", [
    ("ai_base_url", ""),
    ("ai_base_url", "http://model.example/v1"),
    ("ai_base_url", "https://user:password@model.example/v1"),
    ("ai_base_url", "https://model.example/v1?api_key=hidden"),
    ("ai_base_url", "https://model.example/v1#fragment"),
    ("ai_base_url", "https://model.example:bad/v1"),
    ("ai_base_url", "https://model.example/\x00"),
    ("ai_model", ""),
    ("ai_api_key", ""),
    ("ai_api_key", "非英文密钥"),
    ("ai_api_key", "\nprovider-secret-never-return"),
])
def test_unconfigured_or_unsafe_cloud_config_never_calls_provider(client, provider, field, value):
    settings = client.app.state.settings
    setattr(settings, field, type(settings.ai_api_key)(value) if field == "ai_api_key" else value)
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 503
    assert response.json()["code"] == "AI_NOT_CONFIGURED"
    assert provider["requests"] == []


@pytest.mark.parametrize("base_url", ["http://localhost:1234/v1", "http://127.0.0.1:1234/v1", "http://[::1]:1234/v1"])
def test_local_compatible_server_can_run_without_cloud_key(client, provider, base_url):
    client.app.state.settings.ai_base_url = base_url
    client.app.state.settings.ai_api_key = type(client.app.state.settings.ai_api_key)("")
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 200
    assert "Authorization" not in provider["requests"][0].headers


@pytest.mark.parametrize("content", [
    "not JSON provider-secret-never-return",
    "```json\n{}\n```",
    json.dumps({**REPAIR_DRAFT, "category": "任意分类"}),
    json.dumps({**REPAIR_DRAFT, "priority": "HIGH"}),
    json.dumps({**REPAIR_DRAFT, "description": "太短"}),
    json.dumps({**REPAIR_DRAFT, "missingInfo": ["问题"] * 5}),
    json.dumps({**REPAIR_DRAFT, "missingInfo": ["长" * 161]}),
    json.dumps({**REPAIR_DRAFT, "commands": ["publish"]}),
])
def test_invalid_model_content_is_rejected_without_leaking_it(client, provider, content):
    provider["body"] = {"choices": [{"message": {"content": content}, "finish_reason": "stop"}]}
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 502
    assert response.json()["code"] == "AI_INVALID_RESPONSE"
    assert "provider-secret-never-return" not in response.text


@pytest.mark.parametrize("body", [
    {},
    {"choices": []},
    {"choices": [{"message": {"content": None}, "finish_reason": "stop"}]},
    {"choices": [{"message": {"content": json.dumps(REPAIR_DRAFT)}, "finish_reason": "length"}]},
    {"choices": [{"message": {"content": json.dumps(REPAIR_DRAFT), "tool_calls": [{"id": "execute"}]}, "finish_reason": "stop"}]},
])
def test_incomplete_or_unexpected_model_messages_are_rejected(client, provider, body):
    provider["body"] = body
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 502
    assert response.json()["code"] == "AI_INVALID_RESPONSE"


@pytest.mark.parametrize("status", [301, 401, 429, 500])
def test_provider_errors_are_sanitized_and_redirects_are_not_followed(client, provider, status):
    provider["status"] = status
    provider["body"] = {"error": "provider-secret-never-return, internal upstream details"}
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 502
    assert response.json()["code"] == "AI_UPSTREAM_ERROR"
    assert "provider-secret-never-return" not in response.text
    assert "internal upstream details" not in response.text
    assert len(provider["requests"]) == 1


@pytest.mark.parametrize("failure, status, code", [
    (httpx.ReadTimeout("provider-secret-never-return"), 504, "AI_TIMEOUT"),
    (httpx.ConnectError("provider-secret-never-return"), 502, "AI_UPSTREAM_ERROR"),
])
def test_provider_transport_errors_are_sanitized(client, provider, failure, status, code):
    provider["failure"] = failure
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == status
    assert response.json()["code"] == code
    assert "provider-secret-never-return" not in response.text


def test_overall_timeout_stops_a_provider_that_keeps_streaming(client, provider, monkeypatch):
    client.app.state.settings.ai_timeout_seconds = 1
    body = json.dumps({"choices": [{
        "message": {"content": json.dumps(REPAIR_DRAFT)}, "finish_reason": "stop",
    }]}).encode()
    split = len(body) // 3

    class SlowResponseStream(httpx.AsyncByteStream):
        yielded_chunks = 0
        closed = False

        async def __aiter__(self):
            for chunk in (body[:split], body[split:2 * split], body[2 * split:]):
                await anyio.sleep(0.45)
                self.yielded_chunks += 1
                yield chunk

        async def aclose(self):
            self.closed = True

    stream = SlowResponseStream()
    transport = httpx.MockTransport(lambda request: httpx.Response(200, stream=stream))

    async def handle_request(self, request):
        provider["requests"].append(request)
        return await transport.handle_async_request(request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle_request)
    response = client.post("/api/v1/ai/repair-draft", headers=login(client, "owner"), json=REPAIR_INPUT)
    assert response.status_code == 504
    assert response.json()["code"] == "AI_TIMEOUT"
    assert "provider-secret-never-return" not in response.text
    assert 0 < stream.yielded_chunks < 3
    assert stream.closed


def test_per_user_rate_limit_stops_ninth_request_and_expires(client, provider, monkeypatch):
    import app.services.ai_service as service

    clock = [100.0]
    monkeypatch.setattr(service, "monotonic", lambda: clock[0])
    headers = login(client, "owner")
    for _ in range(8):
        assert client.post("/api/v1/ai/repair-draft", headers=headers, json=REPAIR_INPUT).status_code == 200
    response = client.post("/api/v1/ai/repair-draft", headers=headers, json=REPAIR_INPUT)
    assert response.status_code == 429
    assert response.json()["code"] == "AI_RATE_LIMITED"
    assert len(provider["requests"]) == 8
    clock[0] = 161.0
    assert client.post("/api/v1/ai/repair-draft", headers=headers, json=REPAIR_INPUT).status_code == 200
