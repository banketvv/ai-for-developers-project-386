from collections.abc import Iterable
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Расписание владельца — одна константа: будни, 09:00–18:00 в его поясе.
SCHEDULE_WEEKDAYS = frozenset({0, 1, 2, 3, 4})
SCHEDULE_START = time(9, 0)
SCHEDULE_END = time(18, 0)
WINDOW_DAYS = 14

Interval = tuple[datetime, datetime]


def window_days(now: datetime, timezone: str) -> list[date]:
    """Дни окна «сегодня + 13 дней», посчитанные в поясе владельца."""
    today = now.replace(tzinfo=UTC).astimezone(ZoneInfo(timezone)).date()
    return [today + timedelta(days=offset) for offset in range(WINDOW_DAYS)]


def day_slot_starts(day: date, duration_minutes: int, timezone: str) -> list[datetime]:
    """Начала слотов дня в наивном UTC: шаг равен длительности типа встречи."""
    zone = ZoneInfo(timezone)
    slot_start = datetime.combine(day, SCHEDULE_START, tzinfo=zone)
    day_end = datetime.combine(day, SCHEDULE_END, tzinfo=zone)
    step = timedelta(minutes=duration_minutes)
    starts: list[datetime] = []
    while slot_start + step <= day_end:
        starts.append(slot_start.astimezone(UTC).replace(tzinfo=None))
        slot_start += step
    return starts


def overlaps(start: datetime, end: datetime, busy: Iterable[Interval]) -> bool:
    """Пересекается ли отрезок с занятыми отрезками: конец одного не занят."""
    return any(start < busy_end and busy_start < end for busy_start, busy_end in busy)


def slot_grid(
    duration_minutes: int,
    *,
    now: datetime,
    timezone: str,
    busy: Iterable[Interval] = (),
) -> list[tuple[datetime, bool]]:
    """Все слоты окна по возрастанию: начало в наивном UTC и признак доступности."""
    intervals = list(busy)
    step = timedelta(minutes=duration_minutes)
    grid: list[tuple[datetime, bool]] = []
    for day in window_days(now, timezone):
        if day.weekday() not in SCHEDULE_WEEKDAYS:
            continue
        for start in day_slot_starts(day, duration_minutes, timezone):
            if start <= now:
                continue
            grid.append((start, not overlaps(start, start + step, intervals)))
    return grid


def has_available_slot(
    duration_minutes: int,
    *,
    now: datetime,
    timezone: str,
    busy: Iterable[Interval] = (),
) -> bool:
    """Есть ли в окне свободный слот: прошедшее отсекается, занятое пропускается."""
    return any(
        available
        for _, available in slot_grid(
            duration_minutes,
            now=now,
            timezone=timezone,
            busy=busy,
        )
    )
