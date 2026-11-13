from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

TITLE_MAX_LENGTH = 100
DESCRIPTION_MAX_LENGTH = 1000


def _clean_title(value: str | None) -> str:
    """Обрезает название и проверяет длину: пустое значение недопустимо."""
    if value is None:
        raise ValueError("Название не может быть пустым")
    stripped = value.strip()
    if not stripped:
        raise ValueError("Название не может быть пустым")
    if len(stripped) > TITLE_MAX_LENGTH:
        raise ValueError(f"Название не длиннее {TITLE_MAX_LENGTH} символов")
    return stripped


def _clean_description(value: str | None) -> str | None:
    """Обрезает описание: пустая строка означает «без описания»."""
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if len(stripped) > DESCRIPTION_MAX_LENGTH:
        raise ValueError(f"Описание не длиннее {DESCRIPTION_MAX_LENGTH} символов")
    return stripped


class MeetingTypeCreate(BaseModel):
    """Запрос создания типа встречи: владелец задаёт название, описание и длительность."""

    title: str
    description: str | None = None
    duration_minutes: Literal[15, 30, 45, 60] = 30

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        return _clean_title(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        return _clean_description(value)


class MeetingTypeUpdate(BaseModel):
    """Запрос правки типа встречи: любое подмножество полей с проверками создания."""

    title: str | None = None
    description: str | None = None
    duration_minutes: Literal[15, 30, 45, 60] | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str:
        return _clean_title(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        return _clean_description(value)


class MeetingTypeRead(BaseModel):
    """Тип встречи глазами клиента: карточка списка и создание."""

    id: int
    title: str
    description: str | None
    duration_minutes: int
    created_at: datetime
    bookings_count: int
    has_available_slots: bool
    # Длительность заперта сервером, пока у типа есть предстоящие брони.
    duration_locked: bool
