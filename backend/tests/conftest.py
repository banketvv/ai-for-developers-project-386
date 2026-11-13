from collections.abc import AsyncIterator, Iterator
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.clock import get_now
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.models import Booking, MeetingType  # noqa: F401
from app.db.session import get_session
from app.main import create_app

# Фиксированный момент: понедельник, 16 ноября 2026, 12:00 по Москве.
FIXED_NOW = datetime(2026, 11, 16, 9, 0)
TEST_OWNER_EMAIL = "owner@example.com"
TEST_OWNER_NAME = "Владелец календаря"


def enable_foreign_keys(engine: Engine) -> None:
    """Включает внешние ключи на каждом соединении SQLite: по умолчанию они выключены."""

    @event.listens_for(engine, "connect")
    def configure_sqlite(dbapi_connection: Any, _connection_record: Any) -> None:
        dbapi_connection.execute("PRAGMA foreign_keys=ON")


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
def db_path(tmp_path: Path) -> Path:
    """Временная SQLite-база со схемой из моделей: своя на каждый тест."""
    path = tmp_path / "test.db"
    engine = create_engine(f"sqlite:///{path.as_posix()}")
    enable_foreign_keys(engine)
    Base.metadata.create_all(engine)
    engine.dispose()
    return path


@pytest.fixture
def db(db_path: Path) -> Iterator[Session]:
    """Синхронная сессия для подготовки данных (аренды) в тестах."""
    engine = create_engine(f"sqlite:///{db_path.as_posix()}")
    enable_foreign_keys(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def app(settings: Settings, now: datetime, db_path: Path) -> Iterator[FastAPI]:
    """Собранное приложение с подменёнными настройками, часами и базой."""
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path.as_posix()}",
        poolclass=NullPool,
    )
    enable_foreign_keys(engine.sync_engine)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    application = create_app()
    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[get_now] = lambda: now
    application.dependency_overrides[get_session] = override_session
    yield application
    application.dependency_overrides.clear()
    # Соединения не копятся: у пула нет удерживаемых соединений, а файл базы
    # удаляет pytest вместе с временным каталогом.


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """HTTP-клиент к приложению: тесты ходят в него как настоящий клиент."""
    with TestClient(app) as test_client:
        yield test_client
