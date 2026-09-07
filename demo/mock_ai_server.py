"""Deterministic, local OpenAI-compatible provider for offline demonstrations.

The production application deliberately does not ship with an AI provider. This
small server implements only the ``/v1/chat/completions`` endpoint needed by the
demo so that the drafting UI can be shown without sending text to a third party.
"""

from __future__ import annotations

import argparse
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


def _repair_draft(description: str) -> dict[str, Any]:
    text = description.strip()
    lowered = text.lower()

    if any(word in text for word in ("水", "漏", "阀", "下水", "电", "灯")):
        category = "水电维修"
    elif any(word in text for word in ("门", "窗", "锁")):
        category = "门窗维修"
    elif any(word in text for word in ("楼道", "电梯", "路灯", "公共", "小区")):
        category = "公共设施"
    else:
        category = "其他问题"

    urgent = any(word in text for word in ("漏电", "燃气", "起火", "冒烟", "人身", "爆裂", "严重"))
    has_location = bool(re.search(r"(号楼|单元|室|房|楼道|地下|车库|门口|厨房|卫生间|阳台|小区)", text))
    missing_info = [] if has_location else ["请补充问题发生的具体位置"]

    # Keep the user's facts intact. The mock is intentionally conservative so
    # it demonstrates the same human-review step as a real model provider.
    normalized = text or "请补充需要处理的问题描述"
    if lowered.endswith(("。", ".", "！", "!", "？", "?")):
        normalized = normalized[:-1]
    normalized = f"{normalized}。"
    return {
        "category": category,
        "description": normalized,
        "priority": "URGENT" if urgent else "NORMAL",
        "missingInfo": missing_info,
    }


def _notice_draft(title: str, content: str) -> dict[str, Any]:
    clean_title = title.strip()
    clean_content = content.strip()
    if len(clean_title) < 2:
        first_sentence = re.split(r"[。！？.!?\n]", clean_content, maxsplit=1)[0].strip()
        clean_title = first_sentence[:40] or "社区通知"
        if len(clean_title) < 2:
            clean_title = "社区通知"
    normalized = clean_content or "请补充公告内容"
    if normalized[-1:] not in "。！？.!?":
        normalized += "。"

    missing_info: list[str] = []
    if not re.search(r"(今天|明天|后天|本周|下周|\d{1,2}月|\d{1,2}:\d{2}|上午|下午|晚上)", normalized):
        missing_info.append("请补充公告时间")
    if not re.search(r"(业主|居民|住户|号楼|单元|小区|社区|全体)", normalized):
        missing_info.append("请补充适用范围")
    return {"title": clean_title, "content": normalized, "missingInfo": missing_info[:4]}


class DemoAIHandler(BaseHTTPRequestHandler):
    server_version = "SmartCommunityDemoAI/1.0"

    def _json_response(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/healthz":
            self._json_response(200, {"status": "ok", "model": "demo-model"})
            return
        self._json_response(404, {"error": {"message": "not found"}})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path not in {"/v1/chat/completions", "/chat/completions"}:
            self._json_response(404, {"error": {"message": "not found"}})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 64 * 1024:
                raise ValueError("invalid content length")
            request = json.loads(self.rfile.read(length))
            messages = request["messages"]
            system = next(item["content"] for item in messages if item.get("role") == "system")
            user_message = next(item["content"] for item in reversed(messages) if item.get("role") == "user")
            form = json.loads(user_message)
            if "报修草稿" in system:
                draft = _repair_draft(str(form.get("description", "")))
            elif "公告草稿" in system:
                draft = _notice_draft(str(form.get("title", "")), str(form.get("content", "")))
            else:
                raise ValueError("unsupported demo task")
        except (KeyError, TypeError, ValueError, json.JSONDecodeError):
            self._json_response(400, {"error": {"message": "invalid demo completion request"}})
            return

        content = json.dumps(draft, ensure_ascii=False)
        self._json_response(
            200,
            {
                "id": "chatcmpl-demo",
                "object": "chat.completion",
                "model": request.get("model", "demo-model"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            },
        )

    def log_message(self, format: str, *args: Any) -> None:
        if getattr(self.server, "verbose", False):
            super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="Start the offline AI provider used by the community demo")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=9100)
    parser.add_argument("--verbose", action="store_true", help="print each request")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DemoAIHandler)
    server.verbose = args.verbose
    print(f"Demo AI provider listening on http://{args.host}:{args.port}/v1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
