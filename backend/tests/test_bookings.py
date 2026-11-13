import threading
from datetime import datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.models import Booking
from tests.support import create_meeting_type as create_owner_meeting_type

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
    """Заводит тип встречи и снимает владельческую cookie: дальше ходит гость."""
    meeting_type = create_owner_meeting_type(
        client, settings, title=title, duration_minutes=duration_minutes
    )
    client.cookies.clear()
    return meeting_type


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


def test_booking_for_unknown_meeting_type_is_not_found(client: TestClient) -> None:
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
    # Гости разные: с одним email проигравший мог бы получить already_booked вместо
    # slot_taken — это правило тоже нарушено, и его срабатывание зависит от гонки.
    payloads = [
        booking_payload(meeting_type["id"], guest_email=f"guest{index}@example.com")
        for index in range(2)
    ]
    barrier = threading.Barrier(2)
    results: list[tuple[int, dict[str, Any]]] = []

    def attempt(payload: dict[str, object]) -> None:
        with TestClient(app) as thread_client:
            barrier.wait(timeout=10)
            response = thread_client.post("/api/v1/bookings", json=payload)
            results.append((response.status_code, response.json()))

    threads = [threading.Thread(target=attempt, args=(payload,)) for payload in payloads]
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


def test_guest_without_cookie_gets_an_empty_list(client: TestClient, settings: Settings) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    created = client.post("/api/v1/bookings", json=booking_payload(meeting_type["id"]))
    assert created.status_code == 201

    client.cookies.clear()
    response = client.get("/api/v1/bookings")

    assert response.status_code == 200
    assert response.json() == []


def test_guest_list_has_only_their_upcoming_bookings_in_start_order(
    client: TestClient, settings: Settings, db: Session
) -> None:
    first_type = create_meeting_type(client, settings, title="Первый", duration_minutes=60)
    second_type = create_meeting_type(client, settings, title="Второй", duration_minutes=60)
    # Более позднюю бронь создаём первой: порядок задаёт время начала, а не вставка.
    later = client.post(
        "/api/v1/bookings",
        json=booking_payload(
            second_type["id"], start="2026-11-16T11:00:00Z", guest_email="Guest@Example.COM"
        ),
    ).json()
    earlier = client.post("/api/v1/bookings", json=booking_payload(first_type["id"])).json()
    # Прошедшая, текущая и чужая брони не попадают в список гостя.
    db.add_all(
        [
            Booking(
                meeting_type_id=first_type["id"],
                guest_name="Гость",
                guest_email="guest@example.com",
                start=datetime(2026, 11, 16, 8, 0),
                created_at=datetime(2026, 11, 15, 9, 0),
            ),
            Booking(
                meeting_type_id=first_type["id"],
                guest_name="Гость",
                guest_email="guest@example.com",
                start=datetime(2026, 11, 16, 9, 0),
                created_at=datetime(2026, 11, 15, 9, 0),
            ),
            Booking(
                meeting_type_id=second_type["id"],
                guest_name="Другой",
                guest_email="other@example.com",
                start=datetime(2026, 11, 16, 13, 0),
                created_at=datetime(2026, 11, 15, 9, 0),
            ),
        ]
    )
    db.commit()
    client.cookies.clear()
    client.cookies.set(settings.session_cookie_name, "Guest@Example.COM")

    response = client.get("/api/v1/bookings")

    assert response.status_code == 200
    assert [booking["id"] for booking in response.json()] == [earlier["id"], later["id"]]
    assert [booking["start"] for booking in response.json()] == [
        "2026-11-16T10:00:00Z",
        "2026-11-16T11:00:00Z",
    ]


def test_owner_list_has_every_booking_with_guest_contacts(
    client: TestClient, settings: Settings
) -> None:
    meeting_type = create_meeting_type(client, settings, title="Час", duration_minutes=60)
    client.post(
        "/api/v1/bookings",
        json=booking_payload(
            meeting_type["id"],
            start="2026-11-16T10:00:00Z",
            guest_name="Иван",
            guest_email="ivan@example.com",
        ),
    )
    client.post(
        "/api/v1/bookings",
        json=booking_payload(
            meeting_type["id"],
            start="2026-11-16T11:00:00Z",
            guest_name="Мария",
            guest_email="maria@example.com",
        ),
    )
    client.cookies.clear()
    client.post("/api/v1/session", json={"email": settings.owner_email})

    response = client.get("/api/v1/bookings")

    assert response.status_code == 200
    assert [(b["guest_name"], b["guest_email"]) for b in response.json()] == [
        ("Иван", "ivan@example.com"),
        ("Мария", "maria@example.com"),
    ]
    assert [b["start"] for b in response.json()] == [
        "2026-11-16T10:00:00Z",
        "2026-11-16T11:00:00Z",
    ]


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
