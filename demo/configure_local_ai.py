"""Import the local API provider into the backend's ignored environment file."""

import argparse
import json
import sys
import tomllib
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import set_key


ROOT = Path(__file__).resolve().parents[1]


def configure(config_file: Path, auth_file: Path, model: str | None = None) -> dict:
    config = tomllib.loads(config_file.read_text(encoding="utf-8"))
    provider = config.get("model_providers", {}).get(config.get("model_provider"), {})
    auth = json.loads(auth_file.read_text(encoding="utf-8"))
    key = auth.get("OPENAI_API_KEY")
    if not isinstance(key, str) or not key.strip():
        raise ValueError("本机配置中没有可导入的 API Key，请在 backend/.env 配置模型服务。")
    base = str(provider.get("base_url", "")).rstrip("/")
    parsed = urlsplit(base)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if not parsed.hostname or (parsed.scheme != "https" and not (parsed.scheme == "http" and local)) or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("本机模型服务地址不符合要求。")
    if not parsed.path:
        base += "/v1"
    requested_model = model or config.get("model")
    if not isinstance(requested_model, str) or not requested_model.strip():
        raise ValueError("本机配置未提供模型名称。")
    mode = "responses" if provider.get("wire_api") == "responses" else "chat_completions"
    values = {
        "COMMUNITY_AI_ENABLED": "true", "COMMUNITY_AI_BASE_URL": base,
        "COMMUNITY_AI_MODEL": requested_model.strip(), "COMMUNITY_AI_API_KEY": key,
        "COMMUNITY_AI_API_MODE": mode, "COMMUNITY_AI_MODE": "model",
        "COMMUNITY_AI_PROVIDER_NAME": parsed.hostname,
        "COMMUNITY_AI_TIMEOUT_SECONDS": "90", "COMMUNITY_AI_REASONING_EFFORT": "low",
    }
    for name, value in values.items():
        set_key(str(ROOT / "backend" / ".env"), name, value, quote_mode="always")
    return {"provider": parsed.hostname, "model": requested_model.strip(), "apiMode": mode, "configuration": "backend/.env", "credentialImported": True}


def main() -> int:
    parser = argparse.ArgumentParser(description="将本机已有 API 配置导入社区服务端，不输出密钥")
    parser.add_argument("--config", type=Path, default=Path.home() / ".codex" / "config.toml")
    parser.add_argument("--auth", type=Path, default=Path.home() / ".codex" / "auth.json")
    parser.add_argument("--model")
    args = parser.parse_args()
    try:
        result = configure(args.config, args.auth, args.model)
    except (OSError, ValueError, KeyError, TypeError):
        print("无法导入本机 API 配置，请确认配置文件、服务地址和 API Key。", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
