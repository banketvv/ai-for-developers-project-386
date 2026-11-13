from typing import Any

from app.schemas.contract import ErrorResponse

_DESCRIPTIONS = {
    403: "Смотрящий не владелец",
    404: "Ресурс не найден",
    409: "Конфликт: слот занят, бронь уже есть или длительность заперта",
    422: "Ошибка валидации запроса",
}

ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorResponse, "description": description}
    for code, description in _DESCRIPTIONS.items()
}


def error_responses(*status_codes: int) -> dict[int | str, dict[str, Any]]:
    """Документирует у операции ровно те ошибки, что перечислены в контракте."""
    return {code: ERROR_RESPONSES[code] for code in status_codes}
