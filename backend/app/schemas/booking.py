from datetime import UTC, datetime

from pydantic import field_validator

from app.schemas import contract


class BookingCreate(contract.BookingCreate):
    """Запрос брони: время приводится к наивному UTC, почта — к нижнему регистру."""

    @field_validator("start")
    @classmethod
    def to_naive_utc(cls, value: datetime) -> datetime:
        """В БД время хранится без смещения: контракт разрешает момент с поясом."""
        if value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    @field_validator("guest_email")
    @classmethod
    def normalize_guest_email(cls, value: str) -> str:
        """Почта гостя сравнивается в нормализованном виде: обрезка и нижний регистр."""
        return value.strip().lower()


BookingMeetingTypeRead = contract.BookingMeetingTypeRead
BookingRead = contract.BookingRead
