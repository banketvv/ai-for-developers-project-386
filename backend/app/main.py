from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routes.bookings import router as bookings_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.meeting_types import router as meeting_types_router
from app.api.v1.routes.session import router as session_router
from app.api.v1.routes.slots import router as slots_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.db.session import engine


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

    return app


app = create_app()
