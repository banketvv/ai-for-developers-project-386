from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import Booking

# Будни окна «16 ноября + 13 дней»: 16–20 и 23–27 ноября 2026.
WINDOW_WORKDAYS = (16, 17, 18, 19, 20, 23, 24, 25, 26, 27)
# Рабочие часы владельца 09:00–18:00 по Москве — это 06:00–15:00 UTC.
OWNER_TIME_OFFSET_HOURS = 3


def test_empty_list_is_an_empty_array(client: TestClient) -> None:
    response = client.get("/api/v1/meeting-types")

    assert response.status_code == 200
    assert response.json() == []


def test_owner_creates_meeting_type_and_sees_it_in_the_list(
    client: TestClient, settings: Settings
) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})

    response = client.post(
        "/api/v1/meeting-types",
        json={
            "title": "  Знакомство  ",
            "description": "  Короткий звонок  ",
            "duration_minutes": 30,
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["title"] == "Знакомство"
    assert created["description"] == "Короткий звонок"
    assert created["duration_minutes"] == 30
    assert created["bookings_count"] == 0
    assert created["duration_locked"] is False
    assert created["has_available_slots"] is True
    assert isinstance(created["id"], int)
    assert created["created_at"]

    listed = client.get("/api/v1/meeting-types")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [created["id"]]


def test_detail_shows_one_meeting_type(client: TestClient, settings: Settings) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})
    created = client.post(
        "/api/v1/meeting-types",
        json={"title": "Разбор", "duration_minutes": 45},
    ).json()

    response = client.get(f"/api/v1/meeting-types/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_unknown_meeting_type_is_not_found(client: TestClient) -> None:
    response = client.get("/api/v1/meeting-types/999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_list_shows_newest_first(client: TestClient, settings: Settings) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})
    client.post("/api/v1/meeting-types", json={"title": "Первый"})
    client.post("/api/v1/meeting-types", json={"title": "Второй"})

    titles = [item["title"] for item in client.get("/api/v1/meeting-types").json()]

    assert titles == ["Второй", "Первый"]


def test_blank_description_is_stored_without_it(client: TestClient, settings: Settings) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})

    created = client.post(
        "/api/v1/meeting-types",
        json={"title": "Без описания", "description": "   "},
    ).json()

    assert created["description"] is None
    assert created["duration_minutes"] == 30


def test_guest_cannot_create_meeting_type(client: TestClient) -> None:
    response = client.post("/api/v1/meeting-types", json={"title": "Чужой тип"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "forbidden"
    assert client.get("/api/v1/meeting-types").json() == []


def test_cookie_of_another_email_cannot_create_meeting_type(
    client: TestClient, settings: Settings
) -> None:
    client.cookies.set(settings.session_cookie_name, "guest@example.com")

    response = client.post("/api/v1/meeting-types", json={"title": "Чужой тип"})

    assert response.status_code == 403
    assert client.get("/api/v1/meeting-types").json() == []


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({}, "title"),
        ({"title": "   "}, "title"),
        ({"title": "я" * 101}, "title"),
        ({"title": "Звонок", "description": "я" * 1001}, "description"),
        ({"title": "Звонок", "duration_minutes": 20}, "duration_minutes"),
    ],
)
def test_invalid_meeting_type_is_rejected_at_its_field(
    client: TestClient, settings: Settings, payload: dict[str, object], field: str
) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})

    response = client.post("/api/v1/meeting-types", json=payload)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert field in body["error"]["fields"]
    assert client.get("/api/v1/meeting-types").json() == []


def test_type_with_every_slot_taken_is_marked_without_free_slots(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})
    busy_type = client.post(
        "/api/v1/meeting-types",
        json={"title": "Занятый день", "duration_minutes": 60},
    ).json()
    for day in WINDOW_WORKDAYS:
        for hour in range(9, 18):
            db.add(
                Booking(
                    meeting_type_id=busy_type["id"],
                    guest_name="Гость",
                    guest_email="guest@example.com",
                    start=datetime(2026, 11, day, hour - OWNER_TIME_OFFSET_HOURS),
                    created_at=now,
                )
            )
    db.commit()

    client.post(
        "/api/v1/meeting-types",
        json={"title": "Полчаса", "duration_minutes": 30},
    )

    listed = {item["title"]: item for item in client.get("/api/v1/meeting-types").json()}

    assert listed["Занятый день"]["bookings_count"] == 90
    assert listed["Занятый день"]["has_available_slots"] is False
    assert listed["Полчаса"]["has_available_slots"] is False
