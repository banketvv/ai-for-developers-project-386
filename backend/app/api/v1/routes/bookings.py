from fastapi import APIRouter, Response

from app.api.deps import NowDep, SessionDep, SettingsDep, ViewerDep
from app.schemas.booking import BookingCreate, BookingRead
from app.services.bookings import create_booking as create_booking_service
from app.services.bookings import get_booking as get_booking_service
from app.services.session import set_session_cookie

router = APIRouter(prefix="/api/v1/bookings", tags=["bookings"])


@router.post("", response_model=BookingRead, status_code=201)
async def create_booking(
    payload: BookingCreate,
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    now: NowDep,
) -> BookingRead:
    """Создаёт бронь на слот: гость получает cookie со своей почтой."""
    booking = await create_booking_service(
        session,
        payload=payload,
        now=now,
        timezone=settings.owner_timezone,
    )
    set_session_cookie(response, payload.guest_email, settings)
    return booking


@router.get("/{booking_id}", response_model=BookingRead)
async def read_booking(
    booking_id: int,
    session: SessionDep,
    viewer: ViewerDep,
) -> BookingRead:
    """Показывает бронь её гостю и владельцу; остальным отвечает 404."""
    return await get_booking_service(session, booking_id, viewer=viewer)
