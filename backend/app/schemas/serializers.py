from datetime import UTC, datetime


def serialize_utc_moment(value: datetime) -> str:
    """Отдаёт момент с суффиксом Z: клиенту не нужно угадывать смещение."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")
