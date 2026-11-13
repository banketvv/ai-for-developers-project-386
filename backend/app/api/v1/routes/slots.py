from fastapi import APIRouter

from app.api.deps import NowDep, SessionDep, SettingsDep
from app.api.responses import error_responses
from app.schemas.slot import SlotsRead
from app.services.meeting_types import list_slots

router = APIRouter(prefix="/api/v1/meeting-types", tags=["slots"])


@router.get(
    "/{meeting_type_id}/slots", response_model=SlotsRead, responses=error_responses(404, 422)
)
async def read_slots(
    meeting_type_id: int,
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
) -> SlotsRead:
    """Все слоты окна типа встречи: занятые приходят с признаком недоступности."""
    return await list_slots(
        session,
        meeting_type_id,
        now=now,
        timezone=settings.owner_timezone,
    )
