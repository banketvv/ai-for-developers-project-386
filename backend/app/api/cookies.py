from fastapi import Response

from app.core.config import Settings


def set_session_cookie(response: Response, email: str, settings: Settings) -> None:
    """Ставит cookie с почтой смотрящего: механика cookie живёт в HTTP-слое."""
    response.set_cookie(
        key=settings.session_cookie_name,
        value=email,
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
