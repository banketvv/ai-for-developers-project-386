from typing import Literal

from pydantic import field_validator

from app.schemas import contract

# Длительность ограничена CHECK-констрейнтом в БД; для типов ответа это литерал контракта.
DurationMinutes = Literal[15, 30, 45, 60]


class MeetingTypeCreate(contract.MeetingTypeCreate):
    """Запрос создания типа встречи: длительность всегда задана конкретным числом."""

    # В контракте поле необязательное, но присланный `null` недопустим: это не «30 минут».
    duration_minutes: Literal[15, 30, 45, 60] = 30


class MeetingTypeUpdate(contract.MeetingTypeUpdate):
    """Запрос правки типа встречи: любое подмножество полей с проверками создания."""

    @field_validator("title")
    @classmethod
    def reject_null_title(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Название не может быть пустым")
        return value


MeetingTypeRead = contract.MeetingTypeRead
