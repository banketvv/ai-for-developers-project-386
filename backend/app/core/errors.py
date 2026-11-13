from collections.abc import Sequence
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Доменная ошибка API: обработчик приводит её к общему конверту."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        fields: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.fields = fields or {}


# Human-readable подписи полей: сообщения Pydantic не должны протекать в интерфейс.
_FIELD_LABELS = {
    "title": "Название",
    "description": "Описание",
    "guest_name": "Имя",
    "guest_email": "Почта",
    "email": "Почта",
    "start": "Время",
    "duration_minutes": "Длительность",
    "meeting_type_id": "Тип встречи",
}
_EMPTY_FIELD_MESSAGES = {
    "title": "Название не может быть пустым",
    "guest_name": "Имя не может быть пустым",
    "guest_email": "Почта не может быть пустой",
    "email": "Почта не может быть пустой",
}
_EMAIL_FIELDS = {"email", "guest_email"}


def not_found(message: str) -> AppError:
    """Единый 404 на любой неизвестный ресурс: код и статус заданы здесь."""
    return AppError(code="not_found", message=message, status_code=404)


def error_response(
    status_code: int,
    code: str,
    message: str,
    fields: dict[str, str] | None = None,
) -> JSONResponse:
    """Собирает единый конверт ошибки: код, сообщение и ошибки полей."""
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "fields": fields or {}}},
    )


def _message_for(field: str, error: dict[str, Any]) -> str:
    """Переводит машинную ошибку Pydantic в сообщение для поля формы."""
    label = _FIELD_LABELS.get(field, field)
    kind = str(error.get("type", ""))
    context = error.get("ctx") or {}
    if kind == "missing":
        return "Обязательное поле"
    if kind == "string_too_short":
        return _EMPTY_FIELD_MESSAGES.get(field, f"{label} не может быть пустым")
    if kind == "string_too_long":
        return f"{label} не длиннее {context.get('max_length')} символов"
    if kind == "literal_error":
        return "Недопустимое значение"
    if kind.startswith("datetime_"):
        return "Некорректная дата и время"
    if field in _EMAIL_FIELDS:
        if not error.get("input"):
            return _EMPTY_FIELD_MESSAGES[field]
        return "Введите корректный email"
    return str(error.get("msg", "")).removeprefix("Value error, ")


def _validation_fields(errors: Sequence[Any]) -> dict[str, str]:
    fields: dict[str, str] = {}
    for error in errors:
        location = [
            str(part) for part in error.get("loc", ()) if part not in ("body", "query", "path")
        ]
        if location:
            field = ".".join(location)
            fields[field] = _message_for(field, error)
    return fields


def install_error_handlers(app: FastAPI) -> None:
    """Регистрирует обработчики, отдающие все ошибки в едином конверте."""

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.status_code, exc.code, exc.message, exc.fields)

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return error_response(
            422,
            "validation_error",
            "Проверьте заполнение полей",
            _validation_fields(exc.errors()),
        )
