from pydantic import BaseModel, Field, field_validator


class SessionLogin(BaseModel):
    """Запрос входа владельца: почта, по которой сервис его узнаёт."""

    email: str = Field(min_length=1, max_length=320)

    @field_validator("email")
    @classmethod
    def strip_email(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("почта не может быть пустой")
        return stripped


class SessionRead(BaseModel):
    """Кто смотрит сервис: почта из cookie (если есть), роль и имя владельца."""

    email: str | None
    is_owner: bool
    owner_name: str
