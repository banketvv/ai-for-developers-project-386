from fastapi import APIRouter, Response

from app.api.deps import NowDep, OwnerDep, SessionDep, SettingsDep
from app.api.responses import error_responses
from app.schemas.meeting_type import MeetingTypeCreate, MeetingTypeRead, MeetingTypeUpdate
from app.services.meeting_types import create_meeting_type as create_meeting_type_service
from app.services.meeting_types import delete_meeting_type as delete_meeting_type_service
from app.services.meeting_types import get_meeting_type as get_meeting_type_service
from app.services.meeting_types import list_meeting_types
from app.services.meeting_types import update_meeting_type as update_meeting_type_service

router = APIRouter(prefix="/api/v1/meeting-types", tags=["meeting-types"])


@router.get("", response_model=list[MeetingTypeRead])
async def read_meeting_types(
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
) -> list[MeetingTypeRead]:
    """Показывает типы встреч всем: новые сверху, с признаком свободных слотов."""
    return await list_meeting_types(session, now=now, timezone=settings.owner_timezone)


@router.post(
    "", response_model=MeetingTypeRead, status_code=201, responses=error_responses(403, 422)
)
async def create_meeting_type(
    payload: MeetingTypeCreate,
    session: SessionDep,
    owner: OwnerDep,
    settings: SettingsDep,
    now: NowDep,
) -> MeetingTypeRead:
    """Создаёт тип встречи: доступно только владельцу."""
    return await create_meeting_type_service(
        session,
        payload=payload,
        now=now,
        timezone=settings.owner_timezone,
    )


@router.get(
    "/{meeting_type_id}", response_model=MeetingTypeRead, responses=error_responses(404, 422)
)
async def read_meeting_type(
    meeting_type_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
) -> MeetingTypeRead:
    """Показывает один тип встречи всем; неизвестный адрес — 404."""
    return await get_meeting_type_service(
        session,
        meeting_type_id,
        now=now,
        timezone=settings.owner_timezone,
    )


@router.patch(
    "/{meeting_type_id}",
    response_model=MeetingTypeRead,
    responses=error_responses(403, 404, 409, 422),
)
async def update_meeting_type(
    meeting_type_id: int,
    payload: MeetingTypeUpdate,
    session: SessionDep,
    owner: OwnerDep,
    settings: SettingsDep,
    now: NowDep,
) -> MeetingTypeRead:
    """Правит тип встречи: доступно только владельцу, запертая длительность — 409."""
    return await update_meeting_type_service(
        session,
        meeting_type_id,
        payload=payload,
        now=now,
        timezone=settings.owner_timezone,
    )


@router.delete("/{meeting_type_id}", status_code=204, responses=error_responses(403, 404, 422))
async def delete_meeting_type(
    meeting_type_id: int,
    session: SessionDep,
    owner: OwnerDep,
) -> Response:
    """Удаляет тип встречи вместе с бронями: доступно только владельцу."""
    await delete_meeting_type_service(session, meeting_type_id)
    return Response(status_code=204)
