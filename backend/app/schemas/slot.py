from datetime import datetime

from pydantic import BaseModel, field_serializer

from app.schemas.serializers import serialize_utc_moment


class SlotRead(BaseModel):
    """Слот окна: момент начала в UTC и признак доступности."""

    start: datetime
    available: bool

    @field_serializer("start")
    def serialize_start(self, value: datetime) -> str:
        """Отдаёт момент с суффиксом Z: клиенту не нужно угадывать смещение."""
        return serialize_utc_moment(value)


class SlotsRead(BaseModel):
    """Ответ со всеми слотами окна: занятые входят с признаком недоступности."""

    slots: list[SlotRead]
