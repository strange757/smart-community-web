"""Read-only smoke checks for a running community demonstration."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class DemoCheckError(RuntimeError):
    pass


def _call(base_url: str, path: str, token: str | None = None, body: Any = None) -> Any:
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(base_url.rstrip("/") + path, data=data, headers=headers, method="POST" if body is not None else "GET")
    try:
        with urlopen(request, timeout=100 if path.startswith("/api/v1/ai/") else 5) as response:
            raw = response.read()
            status = response.status
    except (HTTPError, URLError, TimeoutError) as error:
        detail = error.read().decode("utf-8", "replace") if isinstance(error, HTTPError) else str(error)
        raise DemoCheckError(f"{path}: {detail}") from error
    if status < 200 or status >= 300:
        raise DemoCheckError(f"{path}: HTTP {status}")
    if not raw:
        return None
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise DemoCheckError(f"{path}: 返回不是 JSON") from error
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="对正在运行的和邻智慧社区执行只读演示检查")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="社区应用地址")
    parser.add_argument("--password", default="123456", help="演示账号密码")
    parser.add_argument("--check-ai", action="store_true", help="额外检查 AI 草稿接口（需要模拟或真实 AI 服务）")
    args = parser.parse_args()

    failures = 0

    def check(label: str, action):
        nonlocal failures
        try:
            result = action()
            display = {key: value for key, value in result.items() if key != "token"} if isinstance(result, dict) else result
            print(f"[OK]   {label}{f' — {display}' if display else ''}")
            return result
        except DemoCheckError as error:
            failures += 1
            print(f"[FAIL] {label} — {error}")
            return None

    check("生产 SPA 可访问", lambda: _call_html(args.base_url))
    sessions: dict[str, dict[str, Any]] = {}
    for username, expected_role in (("owner", "OWNER"), ("property", "PROPERTY"), ("maintenance", "MAINTENANCE")):
        user = check(
            f"{username} 登录",
            lambda username=username, expected_role=expected_role: _login(args.base_url, username, args.password, expected_role),
        )
        if user:
            sessions[username] = user

    owner_token = sessions.get("owner", {}).get("token")
    property_token = sessions.get("property", {}).get("token")
    maintenance_token = sessions.get("maintenance", {}).get("token")

    if owner_token:
        check("业主房屋数据", lambda: f"{len(_call(args.base_url, '/api/v1/me/houses', owner_token))} 套")
        check("业主报修列表", lambda: f"{len(_call(args.base_url, '/api/v1/repairs', owner_token))} 条")
        check("业主待缴账单", lambda: f"{len(_call(args.base_url, '/api/v1/bills?status=UNPAID', owner_token))} 条")
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        check("业主可用车位", lambda: f"{len(_call(args.base_url, f'/api/v1/parking/spaces?date={tomorrow}', owner_token))} 个")
        check("业主可见公告", lambda: f"{len(_call(args.base_url, '/api/v1/notices', owner_token))} 条")
    if property_token:
        check("物业运营概况", lambda: _call(args.base_url, "/api/v1/dashboard/summary", property_token))
        check("物业维修人员列表", lambda: f"{len(_call(args.base_url, '/api/v1/users?role=MAINTENANCE', property_token))} 人")
        check("物业可见公告（含草稿）", lambda: f"{len(_call(args.base_url, '/api/v1/notices', property_token))} 条")
    if maintenance_token:
        check("维修人员工单列表", lambda: f"{len(_call(args.base_url, '/api/v1/repairs', maintenance_token))} 条")
        check("维修人员可见公告", lambda: f"{len(_call(args.base_url, '/api/v1/notices', maintenance_token))} 条")

    if args.check_ai:
        if owner_token:
            check(
                "AI 报修整理",
                lambda: _call(args.base_url, "/api/v1/ai/repair-draft", owner_token, {"description": "厨房水龙头一直漏水"}),
            )
        if property_token:
            check(
                "AI 公告拟稿",
                lambda: _call(args.base_url, "/api/v1/ai/notice-draft", property_token, {"title": "", "content": "本周六上午十点开放邻里中心"}),
            )

    print(f"\n演示检查完成：{0 if failures == 0 else failures} 项失败。")
    return 1 if failures else 0


def _call_html(base_url: str) -> str:
    request = Request(base_url.rstrip("/") + "/", headers={"Accept": "text/html"})
    try:
        with urlopen(request, timeout=5) as response:
            body = response.read(4096)
            if response.status != 200 or b"<html" not in body.lower():
                raise DemoCheckError("首页未返回 HTML")
    except (HTTPError, URLError, TimeoutError) as error:
        raise DemoCheckError(str(error)) from error
    return "HTTP 200"


def _login(base_url: str, username: str, password: str, expected_role: str) -> dict[str, Any]:
    data = _call(base_url, "/api/v1/auth/login", body={"username": username, "password": password})
    if data.get("role") != expected_role or not data.get("token"):
        raise DemoCheckError(f"角色不匹配（期望 {expected_role}）")
    return data


if __name__ == "__main__":
    raise SystemExit(main())
