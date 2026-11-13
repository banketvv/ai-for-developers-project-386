import threading
from datetime import datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import Booking

# Фиксированный момент — понедельник 12:00 по Москве, поэтому первый слот
# окна для часового типа начинается в 13:00 по Москве, то есть в 10:00 UTC.
FIRST_SLOT = "2026-11-16T10:00:00Z"


def create_meeting_type(
    client: TestClient,
    settings: Settings,
    *,
    title: str,
    duration_minutes: int,
) -> dict[str, object]:
    """Заводит тип встречи от имени владельца и снимает владельческую cookie."""
    client.post("/api/v1/session", json={"email": settings.owner_email})
    response = client.post(
        "/api/v1/meeting-types",
        json={"title": title, "duration_minutes": duration_minutes},
    )
    assert response.status_code == 201
    client.cookies.clear()
    return response.json()


def booking_payload(meeting_type_id: object, **overrides: object) -> dict[str, object]:
    """Запрос брони с данными по умолчанию: тест меняет только нужное поле."""
    payload: dict[str, object] = {
        "meeting_type_id": meeting_type_id,
        "start": FIRST_SLOT,
        "guest_name": "Гость",
        "guest_email": "guest@example.com",
    }
    payload.update(overrides)
    return payload


def test_booking_is_created_and_sets_the_guest_cookie(
    client: TestClient, settings: Settings
) -> None:
    meeting_type = create_meeting_type(client, settings, title="Консультация", duration_minutes=60)

    response = client.post("/api/v1/bookings", json=booking_payload(meeting_type["id"]))

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == 1
    assert body["start"] == FIRST_SLOT
    assert body["guest_name"] == "Гость"
    assert body["guest_email"] == "guest@example.com"
    assert body["created_at"] == "2026-11-16T09:00:00"
    assert body["meeting_type"] == {
        "id": meeting_type["id"],
        "title": "Консультация",
        "duration_minutes": 60,
    }
    cookie = response.headers["set-cookie"]
    assert f"{settings.session_cookie_name}=" in cookie
    assert "guest@example.com" in cookie
    assert "HttpOnly" in cookie
    assert "Max-Age=2592000" in cookie
    assert "SameSite=lax" in cookie
    assert client.get("/api/v1/session").json()["email"] == "guest@example.com"


def test_unknown_meeting_type_is_not_found(client: TestClient) -> None:
    response = client.post("/api/v1/bookings", json=booking_payload(999))

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert "set-cookie" not in response.headers


def test_start_must_be_a_slot_of_the_current_grid(client: TestClient, settings: Settings) -> None:
    meeting_type = create_meeting_type(client, settings, title="Полчаса", duration_minutes=30)

    off_grid = client.post(
        "/api/v1/bookings",
        json=booking_payload(meeting_type["id"], start="2026-11-16T10:15:00Z"),
    )
    # 12:00 по Москве — уже не «предстоящий» слот: в сетке его нет.
    past = client.post(
        "/api/v1/bookings",
        json=booking_payload(meeting_type["id"], start="2026-11-16T09:00:00Z"),
    )

    for response in (off_grid, past):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"
        assert "start" in response.json()["error"]["fields"]
    assert "set-cookie" not in off_grid.headers


def test_past_bookings_do_not_block_a_new_one(
    client: TestClient, settings: Settings, db: Session
) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    db.add(
        Booking(
            meeting_type_id=meeting_type["id"],
            guest_name="Гость",
            guest_email="guest@example.com",
            start=datetime(2026, 11, 16, 7, 0),
            created_at=datetime(2026, 11, 15, 9, 0),
        )
    )
    db.commit()

    response = client.post("/api/v1/bookings", json=booking_payload(meeting_type["id"]))

    assert response.status_code == 201


def test_slot_taken_by_another_guest_is_a_conflict(client: TestClient, settings: Settings) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    assert (
        client.post(
            "/api/v1/bookings",
            json=booking_payload(meeting_type["id"], guest_email="first@example.com"),
        ).status_code
        == 201
    )

    response = client.post(
        "/api/v1/bookings",
        json=booking_payload(meeting_type["id"], guest_email="second@example.com"),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "slot_taken"
    # Неудачная попытка не подменяет cookie прошлого гостя.
    assert client.get("/api/v1/session").json()["email"] == "first@example.com"


def test_overlap_with_another_meeting_type_is_a_conflict(
    client: TestClient, settings: Settings
) -> None:
    hour_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    half_hour_type = create_meeting_type(client, settings, title="Полчаса", duration_minutes=30)
    client.post("/api/v1/bookings", json=booking_payload(hour_type["id"]))

    response = client.post(
        "/api/v1/bookings",
        json=booking_payload(half_hour_type["id"], start="2026-11-16T10:30:00Z"),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "slot_taken"


def test_already_booked_wins_over_a_busy_slot(client: TestClient, settings: Settings) -> None:
    meeting_type = create_meeting_type(client, settings, title="Полчаса", duration_minutes=30)
    client.post(
        "/api/v1/bookings",
        json=booking_payload(
            meeting_type["id"], start="2026-11-16T10:00:00Z", guest_email="guest@example.com"
        ),
    )
    client.post(
        "/api/v1/bookings",
        json=booking_payload(
            meeting_type["id"], start="2026-11-16T10:30:00Z", guest_email="other@example.com"
        ),
    )

    response = client.post(
        "/api/v1/bookings",
        json=booking_payload(
            meeting_type["id"], start="2026-11-16T10:30:00Z", guest_email="guest@example.com"
        ),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "already_booked"


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("guest_name", "", "Имя не может быть пустым"),
        ("guest_name", "   ", "Имя не может быть пустым"),
        ("guest_name", "я" * 101, "Имя не длиннее 100 символов"),
        ("guest_email", "", "Почта не может быть пустой"),
        ("guest_email", "не-почта", "Введите корректный email"),
        ("guest_email", "guest@example", "Введите корректный email"),
    ],
)
def test_invalid_fields_are_reported_in_the_envelope(
    client: TestClient,
    settings: Settings,
    field: str,
    value: str,
    message: str,
) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)

    response = client.post(
        "/api/v1/bookings", json=booking_payload(meeting_type["id"], **{field: value})
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
    assert response.json()["error"]["fields"][field] == message
    assert "set-cookie" not in response.headers


def test_contacts_are_trimmed_and_the_email_is_normalized(
    client: TestClient, settings: Settings
) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)

    response = client.post(
        "/api/v1/bookings",
        json=booking_payload(
            meeting_type["id"], guest_name="  Иван  ", guest_email="  Guest@Example.COM "
        ),
    )

    assert response.status_code == 201
    assert response.json()["guest_name"] == "Иван"
    assert response.json()["guest_email"] == "guest@example.com"
    assert client.get("/api/v1/session").json()["email"] == "guest@example.com"


def test_two_concurrent_requests_for_one_slot_give_one_booking(
    app: FastAPI, settings: Settings
) -> None:
    with TestClient(app) as setup_client:
        meeting_type = create_meeting_type(
            setup_client, settings, title="Час", duration_minutes=60
        )
    payload = booking_payload(meeting_type["id"])
    barrier = threading.Barrier(2)
    results: list[tuple[int, dict[str, Any]]] = []

    def attempt() -> None:
        with TestClient(app) as thread_client:
            barrier.wait(timeout=10)
            response = thread_client.post("/api/v1/bookings", json=payload)
            results.append((response.status_code, response.json()))

    threads = [threading.Thread(target=attempt) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=20)

    assert len(results) == 2
    assert sorted(status for status, _ in results) == [201, 409]
    conflict = next(body for status, body in results if status == 409)
    assert conflict["error"]["code"] == "slot_taken"
    created = next(body for status, body in results if status == 201)
    assert created["start"] == FIRST_SLOT


def test_guest_reads_only_their_own_booking(client: TestClient, settings: Settings) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    created = client.post("/api/v1/bookings", json=booking_payload(meeting_type["id"])).json()

    own = client.get(f"/api/v1/bookings/{created['id']}")

    assert own.status_code == 200
    assert own.json() == created

    client.cookies.delete(settings.session_cookie_name)
    client.cookies.set(settings.session_cookie_name, "other@example.com")
    assert client.get(f"/api/v1/bookings/{created['id']}").status_code == 404
    client.cookies.clear()
    assert client.get(f"/api/v1/bookings/{created['id']}").status_code == 404
    assert client.get("/api/v1/bookings/999").status_code == 404


def test_owner_reads_every_booking(client: TestClient, settings: Settings) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    created = client.post("/api/v1/bookings", json=booking_payload(meeting_type["id"])).json()
    client.cookies.clear()
    client.post("/api/v1/session", json={"email": settings.owner_email})

    response = client.get(f"/api/v1/bookings/{created['id']}")

    assert response.status_code == 200
    assert response.json() == created


def test_unknown_booking_is_not_found(client: TestClient, settings: Settings) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})

    response = client.get("/api/v1/bookings/999")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
