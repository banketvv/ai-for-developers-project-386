from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.routes.bookings import router as bookings_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.meeting_types import router as meeting_types_router
from app.api.v1.routes.session import router as session_router
from app.api.v1.routes.slots import router as slots_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.db.session import engine

# Собранный фронтенд кладётся рядом с пакетом `app` (в Docker — /app/static).
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


def _mount_frontend(app: FastAPI) -> None:
    """Отдаёт собранный фронтенд, если он есть рядом с пакетом приложения."""
    if not STATIC_DIR.is_dir():
        return

    static_root = STATIC_DIR.resolve()
    assets_dir = static_root / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str) -> FileResponse:
        """Возвращает файл из сборки или index.html для клиентских маршрутов."""
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

        requested = (static_root / path).resolve()
        if path and requested.is_file() and requested.is_relative_to(static_root):
            return FileResponse(requested)
        return FileResponse(static_root / "index.html")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(session_router)
    app.include_router(meeting_types_router)
    app.include_router(slots_router)
    app.include_router(bookings_router)
    install_error_handlers(app)
    _mount_frontend(app)

    return app


app = create_app()
