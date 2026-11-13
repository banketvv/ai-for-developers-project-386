from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app


def test_session_without_cookie_is_guest(client: TestClient, settings: Settings) -> None:
    response = client.get("/api/v1/session")

    assert response.status_code == 200
    assert response.json() == {
        "email": None,
        "is_owner": False,
        "owner_name": settings.owner_name,
    }


def test_owner_login_sets_session_cookie(client: TestClient, settings: Settings) -> None:
    response = client.post("/api/v1/session", json={"email": settings.owner_email})

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert f"{settings.session_cookie_name}=" in cookie
    assert settings.owner_email in cookie
    assert "HttpOnly" in cookie
    assert "Max-Age=2592000" in cookie
    assert "SameSite=lax" in cookie
    assert "Secure" not in cookie

    session = client.get("/api/v1/session").json()
    assert session == {
        "email": settings.owner_email,
        "is_owner": True,
        "owner_name": settings.owner_name,
    }


def test_foreign_email_is_refused_without_cookie(client: TestClient, settings: Settings) -> None:
    response = client.post("/api/v1/session", json={"email": "guest@example.com"})

    assert response.status_code == 403
    assert response.json() == {
        "error": {
            "code": "forbidden",
            "message": "Этот email не принадлежит владельцу",
            "fields": {"email": "Не совпадает с адресом владельца"},
        }
    }
    assert "set-cookie" not in response.headers
    assert client.get("/api/v1/session").json()["email"] is None


def test_logout_clears_cookie(client: TestClient, settings: Settings) -> None:
    client.post("/api/v1/session", json={"email": settings.owner_email})

    response = client.delete("/api/v1/session")

    assert response.status_code == 204
    cookie = response.headers["set-cookie"]
    assert f"{settings.session_cookie_name}=" in cookie
    assert "Max-Age=0" in cookie
    assert client.get("/api/v1/session").json() == {
        "email": None,
        "is_owner": False,
        "owner_name": settings.owner_name,
    }


def test_owner_email_is_compared_without_case_and_spaces(
    client: TestClient, settings: Settings
) -> None:
    response = client.post(
        "/api/v1/session", json={"email": f"  {settings.owner_email.upper()}  "}
    )

    assert response.status_code == 204
    assert client.get("/api/v1/session").json()["email"] == settings.owner_email
    assert client.get("/api/v1/session").json()["is_owner"] is True


def test_cookie_from_another_email_is_not_owner(client: TestClient, settings: Settings) -> None:
    client.cookies.set(settings.session_cookie_name, "guest@example.com")

    assert client.get("/api/v1/session").json() == {
        "email": "guest@example.com",
        "is_owner": False,
        "owner_name": settings.owner_name,
    }


def test_blank_email_is_a_validation_error(client: TestClient, settings: Settings) -> None:
    response = client.post("/api/v1/session", json={"email": "   "})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "email" in body["error"]["fields"]
    assert "set-cookie" not in response.headers


def test_cookie_is_secure_outside_local_environment(settings: Settings) -> None:
    production_settings = settings.model_copy(update={"environment": "production"})
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: production_settings

    with TestClient(application) as production_client:
        response = production_client.post("/api/v1/session", json={"email": settings.owner_email})

    assert "Secure" in response.headers["set-cookie"]
