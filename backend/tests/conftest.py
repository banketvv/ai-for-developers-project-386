from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.clock import get_now
from app.core.config import Settings, get_settings
from app.main import create_app

# Фиксированный момент: понедельник, 16 ноября 2026, 12:00 по Москве.
FIXED_NOW = datetime(2026, 11, 16, 9, 0)
TEST_OWNER_EMAIL = "owner@example.com"
TEST_OWNER_NAME = "Владелец календаря"


@pytest.fixture
def settings() -> Settings:
    """Тестовые настройки: подменяют .env и окружение."""
    return Settings(
        environment="test",
        owner_email=TEST_OWNER_EMAIL,
        owner_name=TEST_OWNER_NAME,
        owner_timezone="Europe/Moscow",
    )


@pytest.fixture
def now() -> datetime:
    """Фиксированный «текущий момент» для тестов, зависящих от даты."""
    return FIXED_NOW


@pytest.fixture
def app(settings: Settings, now: datetime) -> Iterator[FastAPI]:
    """Собранное приложение с подменёнными настройками и часами."""
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[get_now] = lambda: now
    yield application
    application.dependency_overrides.clear()


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """HTTP-клиент к приложению: тесты ходят в него как настоящий клиент."""
    with TestClient(app) as test_client:
        yield test_client
