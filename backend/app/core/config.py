from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./community.db"
    jwt_secret: str = "replace-this-demo-secret-before-production"
    jwt_hours: int = 8
    frontend_dist: Path = Path(__file__).parents[3] / "frontend" / "dist"
    ai_enabled: bool = False
    ai_base_url: str = ""
    ai_model: str = ""
    ai_api_key: SecretStr = SecretStr("")
    ai_timeout_seconds: float = Field(default=30, ge=1, le=120)
    ai_api_mode: Literal["chat_completions", "responses"] = "chat_completions"
    ai_mode: Literal["model", "mock"] = "model"
    ai_provider_name: str = ""
    ai_reasoning_effort: Literal["none", "low", "medium", "high"] = "low"

    model_config = SettingsConfigDict(
        env_prefix="COMMUNITY_", env_file=Path(__file__).resolve().parents[2] / ".env",
    )
