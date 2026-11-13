from datetime import UTC, datetime
from typing import Any, get_args

from pydantic import BaseModel, field_serializer, model_validator


def _allows_none(annotation: object) -> bool:
    """Проверяет, допускает ли тип поля `None` (для необязательных полей контракта)."""
    return type(None) in get_args(annotation)


class ContractModel(BaseModel):
    """База для моделей, сгенерированных из OpenAPI-контракта.

    До проверки приводит вход к доменным правилам: обрезает строки и трактует
    пустую строку в необязательном поле как «значение не задано». Так контракт
    остаётся описанием формы данных, а не места, где живут правила нормализации.
    """

    @model_validator(mode="before")
    @classmethod
    def normalize_strings(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        normalized: dict[str, Any] = {}
        for key, value in data.items():
            if isinstance(value, str):
                value = value.strip()
                field = cls.model_fields.get(key)
                if value == "" and field is not None and _allows_none(field.annotation):
                    value = None
            normalized[key] = value
        return normalized

    @field_serializer("*", when_used="json")
    def serialize_datetimes(self, value: Any) -> Any:
        """Отдаёт моменты времени в UTC с суффиксом `Z`, как обещает контракт."""
        if isinstance(value, datetime):
            moment = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
            return moment.isoformat(timespec="seconds").replace("+00:00", "Z")
        return value
