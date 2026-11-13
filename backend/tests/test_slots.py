from datetime import date, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.clock import get_now
from app.core.config import Settings, get_settings
from app.db.models import Booking
from app.services.slots import day_slot_starts

# Окно фиксированного момента — «16 ноября + 13 дней»:
# будни 16–20 и 23–27 ноября 2026.
WINDOW_WORKDAY_DATES = {16, 17, 18, 19, 20, 23, 24, 25, 26, 27}


def create_meeting_type(
    client: TestClient,
    settings: Settings,
    *,
    title: str,
    duration_minutes: int,
) -> dict[str, object]:
    """Заводит тип встречи от имени владельца: слоты считаются от его длительности."""
    client.post("/api/v1/session", json={"email": settings.owner_email})
    response = client.post(
        "/api/v1/meeting-types",
        json={"title": title, "duration_minutes": duration_minutes},
    )
    assert response.status_code == 201
    return response.json()


def test_slots_cover_the_whole_window_in_utc(client: TestClient, settings: Settings) -> None:
    created = create_meeting_type(client, settings, title="Час", duration_minutes=60)

    response = client.get(f"/api/v1/meeting-types/{created['id']}/slots")

    assert response.status_code == 200
    slots = response.json()["slots"]
    starts = [slot["start"] for slot in slots]
    # Фиксированный момент — понедельник 12:00 по Москве, поэтому утренние
    # слоты сегодняшнего дня уже прошли и сервер их не отдаёт.
    assert starts[0] == "2026-11-16T10:00:00Z"
    assert starts[-1] == "2026-11-27T14:00:00Z"
    # Десять будних дней по девять часовых слотов минус четыре прошедших.
    assert len(starts) == 86
    assert starts == sorted(starts)
    assert all(slot["available"] is True for slot in slots)
    assert {start[8:10] for start in starts} == {f"{day:02d}" for day in WINDOW_WORKDAY_DATES}


def test_busy_slots_are_returned_as_unavailable_for_every_type(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    hour_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    half_hour_type = create_meeting_type(client, settings, title="Полчаса", duration_minutes=30)
    # Бронь другого типа: понедельник 14:00–15:00 по Москве.
    db.add(
        Booking(
            meeting_type_id=hour_type["id"],
            guest_name="Гость",
            guest_email="guest@example.com",
            start=datetime(2026, 11, 16, 11, 0),
            created_at=now,
        )
    )
    db.commit()

    hour_slots = client.get(f"/api/v1/meeting-types/{hour_type['id']}/slots").json()["slots"]
    half_hour_slots = client.get(f"/api/v1/meeting-types/{half_hour_type['id']}/slots").json()[
        "slots"
    ]

    hour_at_fourteen = next(slot for slot in hour_slots if slot["start"] == "2026-11-16T11:00:00Z")
    assert hour_at_fourteen == {"start": "2026-11-16T11:00:00Z", "available": False}
    half_hour_by_start = {slot["start"]: slot["available"] for slot in half_hour_slots}
    # Пересечение считается по интервалам: 14:00–14:30 и 14:30–15:00 заняты,
    # соседние 13:30 и 15:00 свободны.
    assert half_hour_by_start["2026-11-16T10:30:00Z"] is True
    assert half_hour_by_start["2026-11-16T11:00:00Z"] is False
    assert half_hour_by_start["2026-11-16T11:30:00Z"] is False
    assert half_hour_by_start["2026-11-16T12:00:00Z"] is True


def test_unknown_meeting_type_has_no_slots(client: TestClient) -> None:
    response = client.get("/api/v1/meeting-types/999/slots")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


@pytest.mark.parametrize(
    ("duration_minutes", "last_start"),
    [
        (30, "2026-11-27T14:30:00Z"),
        (45, "2026-11-27T14:15:00Z"),
        (60, "2026-11-27T14:00:00Z"),
    ],
)
def test_slot_grid_ends_exactly_at_closing_time(
    client: TestClient,
    settings: Settings,
    duration_minutes: int,
    last_start: str,
) -> None:
    created = create_meeting_type(client, settings, title="Тип", duration_minutes=duration_minutes)

    slots = client.get(f"/api/v1/meeting-types/{created['id']}/slots").json()["slots"]

    assert slots[-1] == {"start": last_start, "available": True}


def test_grid_drops_a_tail_that_does_not_fit_before_closing() -> None:
    # Для реальных типов длительность кратна 15 минутам, но калькулятор
    # обязан отбрасывать хвост при любой длительности: 50 минут → 16:30.
    starts = day_slot_starts(date(2026, 11, 16), 50, "Europe/Moscow")

    assert len(starts) == 10
    assert starts[-1] == datetime(2026, 11, 16, 13, 30)


def test_slot_offset_is_computed_for_each_date_across_dst(
    client: TestClient, app: FastAPI, settings: Settings
) -> None:
    # Берлин переходит на зимнее время в ночь на 25 октября 2026 года:
    # смещение берётся по дате слота, а не по текущему моменту.
    berlin = settings.model_copy(update={"owner_timezone": "Europe/Berlin"})
    app.dependency_overrides[get_settings] = lambda: berlin
    app.dependency_overrides[get_now] = lambda: datetime(2026, 10, 23, 4, 0)
    created = create_meeting_type(client, settings, title="Час", duration_minutes=60)

    starts = [
        slot["start"]
        for slot in client.get(f"/api/v1/meeting-types/{created['id']}/slots").json()["slots"]
    ]

    assert "2026-10-23T07:00:00Z" in starts  # пятница, 09:00 CEST (+02:00)
    assert "2026-10-26T08:00:00Z" in starts  # понедельник, 09:00 CET (+01:00)
    assert "2026-10-23T16:00:00Z" not in starts  # 18:00 уже не влезает в окно
