from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.models import Booking, MeetingType
from app.schemas.meeting_type import MeetingTypeCreate, MeetingTypeRead, MeetingTypeUpdate
from app.schemas.slot import SlotRead, SlotsRead
from app.services.slots import Interval, has_available_slot, slot_grid

# Дольше любого типа встречи не бывает: более ранняя бронь уже не пересечётся со слотом.
MAX_DURATION = timedelta(minutes=60)


async def upcoming_intervals(session: AsyncSession, now: datetime) -> list[Interval]:
    """Занятые отрезки предстоящих броней всех типов: владелец один."""
    rows = await session.execute(
        select(Booking.start, MeetingType.duration_minutes)
        .join(MeetingType, Booking.meeting_type_id == MeetingType.id)
        .where(Booking.start > now - MAX_DURATION)
    )
    intervals: list[Interval] = []
    for start, duration_minutes in rows:
        end = start + timedelta(minutes=duration_minutes)
        if end > now:
            intervals.append((start, end))
    return intervals


def to_read(
    meeting_type: MeetingType,
    *,
    bookings_count: int,
    has_available_slots: bool,
    duration_locked: bool,
) -> MeetingTypeRead:
    """Собирает ответ по типу встречи и вычисленным полям."""
    return MeetingTypeRead(
        id=meeting_type.id,
        title=meeting_type.title,
        description=meeting_type.description,
        duration_minutes=meeting_type.duration_minutes,
        created_at=meeting_type.created_at,
        bookings_count=bookings_count,
        has_available_slots=has_available_slots,
        duration_locked=duration_locked,
    )


async def type_ids_with_upcoming_bookings(session: AsyncSession, now: datetime) -> set[int]:
    """Типы с предстоящими бронями: у них длительность заперта — одним запросом."""
    rows = await session.execute(
        select(Booking.meeting_type_id).where(Booking.start > now).distinct()
    )
    return set(rows.scalars())


async def list_meeting_types(
    session: AsyncSession,
    *,
    now: datetime,
    timezone: str,
) -> list[MeetingTypeRead]:
    """Список типов встреч: новые сверху, с числом броней и признаком свободных слотов."""
    bookings_count = (
        select(func.count(Booking.id))
        .where(Booking.meeting_type_id == MeetingType.id)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(MeetingType, bookings_count.label("bookings_count")).order_by(
            MeetingType.created_at.desc(),
            MeetingType.id.desc(),
        )
    )
    busy = await upcoming_intervals(session, now)
    locked = await type_ids_with_upcoming_bookings(session, now)
    return [
        to_read(
            meeting_type,
            bookings_count=count,
            has_available_slots=has_available_slot(
                meeting_type.duration_minutes,
                now=now,
                timezone=timezone,
                busy=busy,
            ),
            duration_locked=meeting_type.id in locked,
        )
        for meeting_type, count in rows.all()
    ]


async def create_meeting_type(
    session: AsyncSession,
    *,
    payload: MeetingTypeCreate,
    now: datetime,
    timezone: str,
) -> MeetingTypeRead:
    """Заводит тип встречи: дата создания — текущий момент, броней ещё нет."""
    meeting_type = MeetingType(
        title=payload.title,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        created_at=now,
    )
    session.add(meeting_type)
    await session.commit()
    await session.refresh(meeting_type)
    busy = await upcoming_intervals(session, now)
    return to_read(
        meeting_type,
        bookings_count=0,
        has_available_slots=has_available_slot(
            meeting_type.duration_minutes,
            now=now,
            timezone=timezone,
            busy=busy,
        ),
        duration_locked=False,
    )


def _not_found() -> AppError:
    """Неизвестный тип встречи: один и тот же ответ на любой запрос."""
    return AppError(code="not_found", message="Тип встречи не найден", status_code=404)


async def _read_with_computed(
    session: AsyncSession,
    meeting_type: MeetingType,
    *,
    now: datetime,
    timezone: str,
) -> MeetingTypeRead:
    """Считает число броней, наличие слотов и блокировку длительности."""
    bookings_count = await session.scalar(
        select(func.count(Booking.id)).where(Booking.meeting_type_id == meeting_type.id)
    )
    busy = await upcoming_intervals(session, now)
    return to_read(
        meeting_type,
        bookings_count=bookings_count or 0,
        has_available_slots=has_available_slot(
            meeting_type.duration_minutes,
            now=now,
            timezone=timezone,
            busy=busy,
        ),
        duration_locked=await has_upcoming_bookings(session, meeting_type.id, now=now),
    )


async def has_upcoming_bookings(
    session: AsyncSession,
    meeting_type_id: int,
    *,
    now: datetime,
) -> bool:
    """Есть ли у типа предстоящие брони: они и держат длительность заблокированной."""
    found = await session.scalar(
        select(Booking.id)
        .where(
            Booking.meeting_type_id == meeting_type_id,
            Booking.start > now,
        )
        .limit(1)
    )
    return found is not None


async def get_meeting_type(
    session: AsyncSession,
    meeting_type_id: int,
    *,
    now: datetime,
    timezone: str,
) -> MeetingTypeRead:
    """Показывает один тип встречи или отвечает 404, если его нет."""
    meeting_type = await session.get(MeetingType, meeting_type_id)
    if meeting_type is None:
        raise _not_found()
    return await _read_with_computed(session, meeting_type, now=now, timezone=timezone)


async def update_meeting_type(
    session: AsyncSession,
    meeting_type_id: int,
    *,
    payload: MeetingTypeUpdate,
    now: datetime,
    timezone: str,
) -> MeetingTypeRead:
    """Правит тип встречи: название и описание всегда, длительность — без броней."""
    meeting_type = await session.get(MeetingType, meeting_type_id)
    if meeting_type is None:
        raise _not_found()
    provided = payload.model_fields_set
    if (
        "duration_minutes" in provided
        and payload.duration_minutes is not None
        and payload.duration_minutes != meeting_type.duration_minutes
    ):
        if await has_upcoming_bookings(session, meeting_type_id, now=now):
            raise AppError(
                code="duration_locked",
                message="Длительность нельзя изменить: у типа есть предстоящие брони",
                status_code=409,
            )
        meeting_type.duration_minutes = payload.duration_minutes
    if "title" in provided and payload.title is not None:
        meeting_type.title = payload.title
    if "description" in provided:
        meeting_type.description = payload.description
    await session.commit()
    await session.refresh(meeting_type)
    return await _read_with_computed(session, meeting_type, now=now, timezone=timezone)


async def delete_meeting_type(session: AsyncSession, meeting_type_id: int) -> None:
    """Удаляет тип встречи вместе с его бронями: каскад обеспечивает БД."""
    meeting_type = await session.get(MeetingType, meeting_type_id)
    if meeting_type is None:
        raise _not_found()
    await session.delete(meeting_type)
    await session.commit()


async def list_slots(
    session: AsyncSession,
    meeting_type_id: int,
    *,
    now: datetime,
    timezone: str,
) -> SlotsRead:
    """Все слоты окна типа встречи: занятые входят с признаком недоступности."""
    meeting_type = await session.get(MeetingType, meeting_type_id)
    if meeting_type is None:
        raise AppError(code="not_found", message="Тип встречи не найден", status_code=404)
    busy = await upcoming_intervals(session, now)
    return SlotsRead(
        slots=[
            SlotRead(start=start, available=available)
            for start, available in slot_grid(
                meeting_type.duration_minutes,
                now=now,
                timezone=timezone,
                busy=busy,
            )
        ]
    )
