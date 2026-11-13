from typing import Any

from fastapi.testclient import TestClient

from app.core.config import Settings


def owner_session(client: TestClient, settings: Settings) -> None:
    """Входит владельцем: cookie с его почтой."""
    response = client.post("/api/v1/session", json={"email": settings.owner_email})
    assert response.status_code == 204


def create_meeting_type(
    client: TestClient,
    settings: Settings,
    *,
    title: str,
    duration_minutes: int = 30,
    description: str | None = None,
) -> dict[str, Any]:
    """Заводит тип встречи от имени владельца и возвращает ответ."""
    owner_session(client, settings)
    payload: dict[str, Any] = {"title": title, "duration_minutes": duration_minutes}
    if description is not None:
        payload["description"] = description
    response = client.post("/api/v1/meeting-types", json=payload)
    assert response.status_code == 201
    return response.json()
