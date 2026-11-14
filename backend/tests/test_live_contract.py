"""Проверяет ответы живого uvicorn по OpenAPI-контракту.

Отдельный тест от `test_contract.py`: тот сравнивает описание приложения со
спецификацией, а этот поднимает настоящий сервер на свободном порту и
валидирует реальные HTTP-ответы против схем из `api/openapi/openapi.yaml`.
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

BACKEND_DIR = Path(__file__).resolve().parents[1]
CONTRACT_PATH = BACKEND_DIR.parent / "api" / "openapi" / "openapi.yaml"
FAKE_NOW = "2026-11-16T05:00:00Z"
OWNER_EMAIL = "owner@example.com"
STARTUP_TIMEOUT = 30.0


def load_contract() -> dict[str, Any]:
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


def validator_for(contract: dict[str, Any], schema: dict[str, Any]) -> Draft202012Validator:
    resource = Resource.from_contents(contract, default_specification=DRAFT202012)
    registry = Registry().with_resource("urn:contract", resource)
    return Draft202012Validator(
        schema,
        registry=registry,
        format_checker=FormatChecker(),
    )


def assert_valid(contract: dict[str, Any], schema: dict[str, Any], payload: Any) -> None:
    validator_for(contract, schema).validate(payload)


def schema(name: str) -> dict[str, Any]:
    return {"$ref": f"urn:contract#/components/schemas/{name}"}


def array_of(name: str) -> dict[str, Any]:
    return {"type": "array", "items": schema(name)}


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def server_output(process: subprocess.Popen[str]) -> str:
    if process.poll() is None:
        process.terminate()
    try:
        output, _ = process.communicate(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        output, _ = process.communicate()
    return output or ""


def wait_for_health(base_url: str, process: subprocess.Popen[str]) -> None:
    deadline = time.monotonic() + STARTUP_TIMEOUT
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise AssertionError(f"uvicorn завершился до старта:\n{server_output(process)}")
        try:
            response = httpx.get(f"{base_url}/health", timeout=1.0)
            if response.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(0.1)
    raise AssertionError(
        f"uvicorn не поднялся за {STARTUP_TIMEOUT} секунд:\n{server_output(process)}"
    )


@pytest.fixture(scope="module")
def live_server(tmp_path_factory: pytest.TempPathFactory) -> Iterator[str]:
    directory = tmp_path_factory.mktemp("live")
    db_path = directory / "live.db"
    port = free_port()
    base_url = f"http://127.0.0.1:{port}"

    env = os.environ.copy()
    env.update(
        {
            "ENVIRONMENT": "test",
            "DATABASE_URL": f"sqlite+aiosqlite:///{db_path.as_posix()}",
            "OWNER_NAME": "Владелец календаря",
            "OWNER_EMAIL": OWNER_EMAIL,
            "OWNER_TIMEZONE": "Europe/Moscow",
            "FAKE_NOW": FAKE_NOW,
        }
    )

    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )

    log_path = directory / "uvicorn.log"
    with log_path.open("w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            wait_for_health(base_url, process)
            yield base_url
        finally:
            if process.poll() is None:
                process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def test_live_server_responses_match_the_contract(live_server: str) -> None:
    contract = load_contract()

    with httpx.Client(base_url=live_server, timeout=10.0) as owner:
        health = owner.get("/health")
        assert health.status_code == 200
        assert_valid(contract, schema("HealthRead"), health.json())

        session = owner.get("/api/v1/session")
        assert session.status_code == 200
        assert_valid(contract, schema("SessionRead"), session.json())

        meeting_types = owner.get("/api/v1/meeting-types")
        assert meeting_types.status_code == 200
        assert_valid(contract, array_of("MeetingTypeRead"), meeting_types.json())

        login = owner.post("/api/v1/session", json={"email": OWNER_EMAIL})
        assert login.status_code == 204

        created = owner.post(
            "/api/v1/meeting-types",
            json={"title": "Живой контракт", "duration_minutes": 30},
        )
        assert created.status_code == 201
        meeting_type = created.json()
        assert_valid(contract, schema("MeetingTypeRead"), meeting_type)

        slots = owner.get(f"/api/v1/meeting-types/{meeting_type['id']}/slots")
        assert slots.status_code == 200
        slots_payload = slots.json()
        assert_valid(contract, schema("SlotsRead"), slots_payload)
        start = next(slot["start"] for slot in slots_payload["slots"] if slot["available"])

    with httpx.Client(base_url=live_server, timeout=10.0) as guest:
        booking = guest.post(
            "/api/v1/bookings",
            json={
                "meeting_type_id": meeting_type["id"],
                "start": start,
                "guest_name": "Гость",
                "guest_email": "guest@example.com",
            },
        )
        assert booking.status_code == 201
        booking_payload = booking.json()
        assert_valid(contract, schema("BookingRead"), booking_payload)

        read = guest.get(f"/api/v1/bookings/{booking_payload['id']}")
        assert read.status_code == 200
        assert_valid(contract, schema("BookingRead"), read.json())

    with httpx.Client(base_url=live_server, timeout=10.0) as second_guest:
        conflict = second_guest.post(
            "/api/v1/bookings",
            json={
                "meeting_type_id": meeting_type["id"],
                "start": start,
                "guest_name": "Второй гость",
                "guest_email": "second@example.com",
            },
        )
        assert conflict.status_code == 409
        assert_valid(contract, schema("ErrorResponse"), conflict.json())
