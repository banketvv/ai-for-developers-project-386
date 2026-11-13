from typing import Annotated

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.services.session import Viewer, viewer_from_email


def get_viewer(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> Viewer:
    """FastAPI-зависимость: смотрящий, определённый по cookie и настройке владельца."""
    return viewer_from_email(request.cookies.get(settings.session_cookie_name), settings)


ViewerDep = Annotated[Viewer, Depends(get_viewer)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
