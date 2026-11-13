from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

TITLE_MAX_LENGTH = 100
DESCRIPTION_MAX_LENGTH = 1000


class MeetingTypeCreate(BaseModel):
    """Запрос создания типа встречи: владелец задаёт название, описание и длительность."""

    title: str
    description: str | None = None
    duration_minutes: Literal[15, 30, 45, 60] = 30

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Название не может быть пустым")
        if len(stripped) > TITLE_MAX_LENGTH:
            raise ValueError(f"Название не длиннее {TITLE_MAX_LENGTH} символов")
        return stripped

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > DESCRIPTION_MAX_LENGTH:
            raise ValueError(f"Описание не длиннее {DESCRIPTION_MAX_LENGTH} символов")
        return stripped


class MeetingTypeRead(BaseModel):
    """Тип встречи глазами клиента: карточка списка и создание."""

    id: int
    title: str
    description: str | None
    duration_minutes: int
    created_at: datetime
    bookings_count: int
    has_available_slots: bool
