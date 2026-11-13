from dataclasses import dataclass

from fastapi import Response

from app.core.config import Settings


def normalize_email(email: str) -> str:
    """Обрезает пробелы и приводит почту к нижнему регистру."""
    return email.strip().lower()


@dataclass(frozen=True)
class Viewer:
    """Кто смотрит сервис на этом устройстве и владелец ли он."""

    email: str | None
    is_owner: bool


def viewer_from_email(email: str | None, settings: Settings) -> Viewer:
    """Определяет роль смотрящего по значению cookie и настройке владельца."""
    if not email:
        return Viewer(email=None, is_owner=False)
    return Viewer(
        email=email,
        is_owner=normalize_email(email) == normalize_email(settings.owner_email),
    )


def set_session_cookie(response: Response, email: str, settings: Settings) -> None:
    """Ставит cookie с почтой смотрящего."""
    response.set_cookie(
        key=settings.session_cookie_name,
        value=normalize_email(email),
        max_age=settings.session_cookie_max_age,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    """Удаляет cookie с почтой смотрящего."""
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        samesite="lax",
        secure=settings.environment == "production",
        path="/",
    )
