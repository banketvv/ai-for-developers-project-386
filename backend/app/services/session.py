from dataclasses import dataclass

from app.core.config import Settings


def normalize_email(email: str) -> str:
    """Обрезает пробелы и приводит почту к нижнему регистру."""
    return email.strip().lower()


def is_owner_email(email: str, settings: Settings) -> bool:
    """Совпадает ли почта с адресом владельца: правило входа, без HTTP."""
    return normalize_email(email) == normalize_email(settings.owner_email)


@dataclass(frozen=True)
class Viewer:
    """Кто смотрит сервис на этом устройстве и владелец ли он."""

    email: str | None
    is_owner: bool


def viewer_from_email(email: str | None, settings: Settings) -> Viewer:
    """Определяет роль смотрящего по значению cookie и настройке владельца."""
    if not email:
        return Viewer(email=None, is_owner=False)
    return Viewer(email=email, is_owner=is_owner_email(email, settings))
