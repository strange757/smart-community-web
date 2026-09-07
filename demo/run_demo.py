"""Run the local community demo and its optional offline AI provider."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def _wait_for(url: str, process: subprocess.Popen[bytes], timeout: float = 20) -> None:
    deadline = time.monotonic() + timeout
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"进程提前退出（exit={process.returncode}）")
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= response.status < 500:
                    return
        except (OSError, urllib.error.URLError) as error:
            last_error = str(error)
        time.sleep(0.25)
    raise RuntimeError(f"等待服务启动超时：{url}（{last_error}）")


def _stop(process: subprocess.Popen[bytes] | None) -> None:
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _probe_host(host: str) -> str:
    return "127.0.0.1" if host in {"0.0.0.0", "::"} else host


def main() -> int:
    parser = argparse.ArgumentParser(
        description="启动和邻智慧社区演示（默认同时启动离线 AI 模拟服务）"
    )
    parser.add_argument("--host", default="127.0.0.1", help="社区应用监听地址")
    parser.add_argument("--port", type=int, default=8000, help="社区应用端口")
    parser.add_argument("--ai-port", type=int, default=9100, help="离线 AI 模拟服务端口")
    parser.add_argument("--database", type=Path, help="演示 SQLite 文件路径")
    parser.add_argument("--reset", action="store_true", help="启动前重建指定的演示数据库")
    parser.add_argument("--no-mock-ai", action="store_true", help="不启动离线 AI 模拟服务，使用已有配置")
    args = parser.parse_args()

    index_file = ROOT / "frontend" / "dist" / "index.html"
    if not index_file.is_file():
        print(
            f"缺少前端构建产物：{index_file}\n"
            "请先运行：npm --prefix frontend run build",
            file=sys.stderr,
        )
        return 2

    backend_command = [sys.executable, str(ROOT / "backend" / "run.py"), "--host", args.host, "--port", str(args.port)]
    if args.database:
        backend_command.extend(["--database", str(args.database)])
    if args.reset:
        backend_command.append("--reset")

    mock_process: subprocess.Popen[bytes] | None = None
    backend_process: subprocess.Popen[bytes] | None = None
    environment = os.environ.copy()
    try:
        if not args.no_mock_ai:
            mock_process = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("mock_ai_server.py")), "--host", "127.0.0.1", "--port", str(args.ai_port)],
                cwd=ROOT,
            )
            _wait_for(f"http://127.0.0.1:{args.ai_port}/healthz", mock_process)
            environment.update(
                {
                    "COMMUNITY_AI_ENABLED": "true",
                    "COMMUNITY_AI_BASE_URL": f"http://127.0.0.1:{args.ai_port}/v1",
                    "COMMUNITY_AI_MODEL": "demo-model",
                    "COMMUNITY_AI_API_KEY": "",
                }
            )

        backend_process = subprocess.Popen(backend_command, cwd=ROOT, env=environment)
        probe_host = _probe_host(args.host)
        _wait_for(f"http://{probe_host}:{args.port}/docs", backend_process)
        print("\n和邻智慧社区演示已启动：", flush=True)
        print(f"  应用：   http://{probe_host}:{args.port}", flush=True)
        print(f"  API 文档：http://{probe_host}:{args.port}/docs", flush=True)
        if not args.no_mock_ai:
            print(f"  AI 模拟： http://127.0.0.1:{args.ai_port}/v1", flush=True)
        print("  账号：   owner / property / maintenance（密码均为 123456）", flush=True)
        print("\n按 Ctrl+C 停止演示。", flush=True)
        while backend_process.poll() is None:
            time.sleep(0.5)
        return int(backend_process.returncode or 0)
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError) as error:
        print(f"演示启动失败：{error}", file=sys.stderr)
        return 1
    finally:
        _stop(backend_process)
        _stop(mock_process)


if __name__ == "__main__":
    raise SystemExit(main())
