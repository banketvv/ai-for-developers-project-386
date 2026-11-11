from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Настройки приложения, читаются из переменных окружения и .env."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Call Scheduler"
    environment: Literal["local", "test", "production"] = "local"
    debug: bool = False

    database_url: str = "sqlite+aiosqlite:///./app.db"

    owner_name: str = "Owner"
    owner_email: str = "owner@example.com"
    owner_timezone: str = "UTC"

    cors_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_cors_origins(cls, value: object) -> object:
        """Разрешает задавать CORS_ORIGINS списком через запятую."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
