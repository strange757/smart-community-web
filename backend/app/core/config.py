from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./community.db"
    jwt_secret: str = "replace-this-demo-secret-before-production"
    jwt_hours: int = 8
    frontend_dist: Path = Path(__file__).parents[3] / "frontend" / "dist"

    model_config = SettingsConfigDict(env_prefix="COMMUNITY_", env_file=".env")
