from datetime import UTC, datetime

from app.core.config import get_settings


def now() -> datetime:
    """Текущий момент в UTC без смещения: в БД время хранится наивным."""
    fixed = get_settings().fake_now
    if fixed is not None:
        # Браузерные тесты фиксируют момент, чтобы слоты не зависели от даты запуска.
        return fixed.astimezone(UTC).replace(tzinfo=None) if fixed.tzinfo else fixed
    return datetime.now(UTC).replace(tzinfo=None)


def get_now() -> datetime:
    """FastAPI-зависимость «текущий момент»; в тестах подменяется фиксированным."""
    return now()
