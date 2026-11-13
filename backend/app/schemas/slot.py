from datetime import UTC, datetime

from pydantic import BaseModel, field_serializer


class SlotRead(BaseModel):
    """Слот окна: момент начала в UTC и признак доступности."""

    start: datetime
    available: bool

    @field_serializer("start")
    def serialize_start(self, value: datetime) -> str:
        """Отдаёт момент с суффиксом Z: клиенту не нужно угадывать смещение."""
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class SlotsRead(BaseModel):
    """Ответ со всеми слотами окна: занятые входят с признаком недоступности."""

    slots: list[SlotRead]
