from datetime import UTC, datetime


def now() -> datetime:
    """Текущий момент в UTC без смещения: в БД время хранится наивным."""
    return datetime.now(UTC).replace(tzinfo=None)


def get_now() -> datetime:
    """FastAPI-зависимость «текущий момент»; в тестах подменяется фиксированным."""
    return now()
