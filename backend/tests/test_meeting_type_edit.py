from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import Booking
from tests.support import create_meeting_type, owner_session


def add_booking(
    db: Session,
    meeting_type_id: int,
    *,
    start: datetime,
    now: datetime,
    email: str = "guest@example.com",
) -> Booking:
    """Кладёт бронь напрямую: правка типа проверяется через HTTP."""
    booking = Booking(
        meeting_type_id=meeting_type_id,
        guest_name="Гость",
        guest_email=email,
        start=start,
        created_at=now,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def upcoming_start(now: datetime) -> datetime:
    """Заведомо предстоящий слот: следующий день, 10:00 по Москве."""
    return (now + timedelta(days=1)).replace(hour=7, minute=0, second=0, microsecond=0)


def test_owner_updates_title_and_description(client: TestClient, settings: Settings) -> None:
    created = create_meeting_type(
        client,
        settings,
        title="Старое название",
        description="Старое описание",
        duration_minutes=30,
    )

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"title": "  Новое название  ", "description": "  Новое описание  "},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Новое название"
    assert updated["description"] == "Новое описание"
    assert updated["duration_minutes"] == 30
    assert updated["bookings_count"] == 0
    assert client.get(f"/api/v1/meeting-types/{created['id']}").json() == updated


def test_blank_description_clears_it(client: TestClient, settings: Settings) -> None:
    created = create_meeting_type(client, settings, title="С описанием", description="Текст")

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"description": "   "},
    )

    assert response.status_code == 200
    assert response.json()["description"] is None


def test_duration_changes_without_bookings_and_applies_to_slots(
    client: TestClient, settings: Settings
) -> None:
    created = create_meeting_type(client, settings, title="Короткая", duration_minutes=15)

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"duration_minutes": 45},
    )

    assert response.status_code == 200
    assert response.json()["duration_minutes"] == 45

    slots = client.get(f"/api/v1/meeting-types/{created['id']}/slots").json()["slots"]
    first, second = slots[0]["start"], slots[1]["start"]
    assert datetime.fromisoformat(second) - datetime.fromisoformat(first) == timedelta(minutes=45)


def test_duration_is_locked_while_upcoming_booking_exists(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    created = create_meeting_type(client, settings, title="Занятая", duration_minutes=30)
    add_booking(db, int(created["id"]), start=upcoming_start(now), now=now)

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"duration_minutes": 60},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "duration_locked"
    detail = client.get(f"/api/v1/meeting-types/{created['id']}").json()
    assert detail["duration_minutes"] == 30
    # Признак блокировки считает сервер: клиент не выводит его из общего числа броней.
    assert detail["duration_locked"] is True


def test_title_and_description_stay_editable_with_upcoming_bookings(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    created = create_meeting_type(client, settings, title="Старое", duration_minutes=30)
    add_booking(db, int(created["id"]), start=upcoming_start(now), now=now)

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"title": "Новое", "description": "Описание"},
    )

    assert response.status_code == 200
    updated = response.json()
    assert updated["title"] == "Новое"
    assert updated["description"] == "Описание"
    assert updated["bookings_count"] == 1


def test_duration_kept_the_same_is_not_locked(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    created = create_meeting_type(client, settings, title="Занятая", duration_minutes=30)
    add_booking(db, int(created["id"]), start=upcoming_start(now), now=now)

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"duration_minutes": 30},
    )

    assert response.status_code == 200
    assert response.json()["duration_minutes"] == 30


def test_past_bookings_do_not_lock_duration(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    created = create_meeting_type(client, settings, title="Прошедшая", duration_minutes=30)
    add_booking(db, int(created["id"]), start=now - timedelta(days=1), now=now)

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"duration_minutes": 45},
    )

    assert response.status_code == 200
    assert response.json()["duration_minutes"] == 45
    assert response.json()["duration_locked"] is False
    detail = client.get(f"/api/v1/meeting-types/{created['id']}").json()
    assert detail["duration_minutes"] == 45
    assert detail["duration_locked"] is False
    # Общее число броней остаётся для предупреждения об удалении.
    assert detail["bookings_count"] == 1


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"title": "   "}, "title"),
        ({"title": None}, "title"),
        ({"title": "я" * 101}, "title"),
        ({"description": "я" * 1001}, "description"),
        ({"duration_minutes": 20}, "duration_minutes"),
    ],
)
def test_invalid_update_is_rejected_at_its_field(
    client: TestClient,
    settings: Settings,
    payload: dict[str, object],
    field: str,
) -> None:
    created = create_meeting_type(client, settings, title="Название")

    response = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json=payload,
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert field in body["error"]["fields"]
    assert client.get(f"/api/v1/meeting-types/{created['id']}").json()["title"] == "Название"


def test_update_of_unknown_type_is_not_found(client: TestClient, settings: Settings) -> None:
    owner_session(client, settings)

    response = client.patch("/api/v1/meeting-types/999", json={"title": "Новое"})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_delete_removes_type_and_its_bookings(
    client: TestClient, settings: Settings, db: Session, now: datetime
) -> None:
    created = create_meeting_type(client, settings, title="Удаляемая")
    booking = add_booking(db, int(created["id"]), start=upcoming_start(now), now=now)

    response = client.delete(f"/api/v1/meeting-types/{created['id']}")

    assert response.status_code == 204
    assert client.get("/api/v1/meeting-types").json() == []
    assert client.get(f"/api/v1/bookings/{booking.id}").status_code == 404


def test_delete_of_unknown_type_is_not_found(client: TestClient, settings: Settings) -> None:
    owner_session(client, settings)

    response = client.delete("/api/v1/meeting-types/999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_guest_cannot_update_or_delete_meeting_type(
    client: TestClient, settings: Settings
) -> None:
    created = create_meeting_type(client, settings, title="Чужой тип")
    client.cookies.clear()

    update = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"title": "Взлом"},
    )
    delete = client.delete(f"/api/v1/meeting-types/{created['id']}")

    assert update.status_code == 403
    assert update.json()["error"]["code"] == "forbidden"
    assert delete.status_code == 403
    assert delete.json()["error"]["code"] == "forbidden"
    assert client.get(f"/api/v1/meeting-types/{created['id']}").json()["title"] == ("Чужой тип")


def test_cookie_of_another_email_cannot_update_or_delete(
    client: TestClient, settings: Settings
) -> None:
    created = create_meeting_type(client, settings, title="Чужой тип")
    client.cookies.clear()
    client.cookies.set(settings.session_cookie_name, "guest@example.com")

    update = client.patch(
        f"/api/v1/meeting-types/{created['id']}",
        json={"title": "Взлом"},
    )
    delete = client.delete(f"/api/v1/meeting-types/{created['id']}")

    assert update.status_code == 403
    assert delete.status_code == 403
    assert client.get(f"/api/v1/meeting-types/{created['id']}").status_code == 200
