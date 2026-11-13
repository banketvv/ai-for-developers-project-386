import re
from datetime import UTC, datetime

from pydantic import BaseModel, field_serializer, field_validator

from app.schemas.serializers import serialize_utc_moment

GUEST_NAME_MAX_LENGTH = 100
GUEST_EMAIL_MAX_LENGTH = 320
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class BookingCreate(BaseModel):
    """Запрос брони: гость выбирает слот типа встречи и оставляет контакты."""

    meeting_type_id: int
    start: datetime
    guest_name: str
    guest_email: str

    @field_validator("start")
    @classmethod
    def to_naive_utc(cls, value: datetime) -> datetime:
        """Приводит момент к наивному UTC: в БД время хранится без смещения."""
        if value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    @field_validator("guest_name")
    @classmethod
    def validate_guest_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Имя не может быть пустым")
        if len(stripped) > GUEST_NAME_MAX_LENGTH:
            raise ValueError(f"Имя не длиннее {GUEST_NAME_MAX_LENGTH} символов")
        return stripped

    @field_validator("guest_email")
    @classmethod
    def validate_guest_email(cls, value: str) -> str:
        stripped = value.strip().lower()
        if not stripped:
            raise ValueError("Почта не может быть пустой")
        if len(stripped) > GUEST_EMAIL_MAX_LENGTH:
            raise ValueError(f"Почта не длиннее {GUEST_EMAIL_MAX_LENGTH} символов")
        if not _EMAIL_PATTERN.fullmatch(stripped):
            raise ValueError("Введите корректный email")
        return stripped


class BookingMeetingTypeRead(BaseModel):
    """Тип встречи внутри брони: название и длительность нужны подтверждению."""

    id: int
    title: str
    duration_minutes: int


class BookingRead(BaseModel):
    """Бронь глазами клиента: номер, слот, контакты и тип встречи."""

    id: int
    start: datetime
    guest_name: str
    guest_email: str
    created_at: datetime
    meeting_type: BookingMeetingTypeRead

    @field_serializer("start")
    def serialize_start(self, value: datetime) -> str:
        """Отдаёт начало слота с суффиксом Z: клиенту не нужно угадывать смещение."""
        return serialize_utc_moment(value)
