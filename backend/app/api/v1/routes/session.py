from fastapi import APIRouter, Response

from app.api.deps import SettingsDep, ViewerDep
from app.core.errors import AppError
from app.schemas.session import SessionLogin, SessionRead
from app.services.session import (
    clear_session_cookie,
    normalize_email,
    set_session_cookie,
)

router = APIRouter(prefix="/api/v1/session", tags=["session"])


@router.get("", response_model=SessionRead)
def read_session(viewer: ViewerDep, settings: SettingsDep) -> SessionRead:
    """Сообщает, кто смотрит сервис и владелец ли он."""
    return SessionRead(
        email=viewer.email,
        is_owner=viewer.is_owner,
        owner_name=settings.owner_name,
    )


@router.post("", status_code=204)
def log_in(payload: SessionLogin, response: Response, settings: SettingsDep) -> None:
    """Вход владельца: узнаёт его по почте и ставит cookie."""
    email = normalize_email(payload.email)
    if email != normalize_email(settings.owner_email):
        raise AppError(
            code="forbidden",
            message="Этот email не принадлежит владельцу",
            status_code=403,
            fields={"email": "Не совпадает с адресом владельца"},
        )
    set_session_cookie(response, email, settings)


@router.delete("", status_code=204)
def log_out(response: Response, settings: SettingsDep) -> None:
    """Смена почты: очищает cookie и возвращает к форме входа."""
    clear_session_cookie(response, settings)
