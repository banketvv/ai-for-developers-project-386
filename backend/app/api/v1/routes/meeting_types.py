from fastapi import APIRouter

from app.api.deps import NowDep, OwnerDep, SessionDep, SettingsDep
from app.schemas.meeting_type import MeetingTypeCreate, MeetingTypeRead
from app.services.meeting_types import create_meeting_type as create_meeting_type_service
from app.services.meeting_types import get_meeting_type as get_meeting_type_service
from app.services.meeting_types import list_meeting_types

router = APIRouter(prefix="/api/v1/meeting-types", tags=["meeting-types"])


@router.get("", response_model=list[MeetingTypeRead])
async def read_meeting_types(
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
) -> list[MeetingTypeRead]:
    """Показывает типы встреч всем: новые сверху, с признаком свободных слотов."""
    return await list_meeting_types(session, now=now, timezone=settings.owner_timezone)


@router.post("", response_model=MeetingTypeRead, status_code=201)
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


@router.get("/{meeting_type_id}", response_model=MeetingTypeRead)
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
