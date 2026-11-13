from datetime import datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clock import get_now
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.db.session import get_session
from app.services.session import Viewer, viewer_from_email


def get_viewer(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Viewer:
    """FastAPI-зависимость: смотрящий, определённый по cookie и настройке владельца."""
    return viewer_from_email(request.cookies.get(settings.session_cookie_name), settings)


ViewerDep = Annotated[Viewer, Depends(get_viewer)]


def require_owner(viewer: ViewerDep) -> Viewer:
    """Пропускает только владельца: гостю отвечаем 403 в общем конверте ошибок."""
    if not viewer.is_owner:
        raise AppError(
            code="forbidden",
            message="Действие доступно только владельцу",
            status_code=403,
        )
    return viewer


OwnerDep = Annotated[Viewer, Depends(require_owner)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
NowDep = Annotated[datetime, Depends(get_now)]
