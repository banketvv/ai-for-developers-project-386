from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI
from openapi_spec_validator import validate

CONTRACT_PATH = Path(__file__).resolve().parents[2] / "api" / "openapi" / "openapi.yaml"

# HTTP-методы, которые контракт описывает; `parameters` — не операция.
_HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}


def load_contract() -> dict[str, Any]:
    """Читает закоммиченную спецификацию — единственный источник правды API."""
    return yaml.safe_load(CONTRACT_PATH.read_text(encoding="utf-8"))


def resolve(document: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    """Разворачивает `$ref`, чтобы сравнивать сами схемы, а не их имена."""
    while "$ref" in schema:
        name = schema["$ref"].rsplit("/", 1)[-1]
        schema = document["components"]["schemas"][name]
    return schema


def success_schema(document: dict[str, Any], operation: dict[str, Any]) -> dict[str, Any] | None:
    """Схема успешного ответа: первая 2xx с JSON-телом."""
    for status, response in operation["responses"].items():
        if status.startswith("2") and "content" in response:
            return response["content"]["application/json"]["schema"]
    return None


def schema_shape(document: dict[str, Any], schema: dict[str, Any]) -> tuple[set[str], set[str]]:
    """Имена полей и обязательные поля; у массивов смотрит на элемент."""
    resolved = resolve(document, schema)
    if resolved.get("type") == "array":
        return schema_shape(document, resolved["items"])
    return set(resolved.get("properties", {})), set(resolved.get("required", []))


def request_schema(operation: dict[str, Any]) -> dict[str, Any] | None:
    """Схема тела запроса операции."""
    return (
        operation.get("requestBody", {})
        .get("content", {})
        .get("application/json", {})
        .get("schema")
    )


def test_contract_is_a_valid_openapi_document() -> None:
    validate(load_contract())


def test_slots_operation_documents_the_booking_window() -> None:
    contract = load_contract()
    operation = contract["paths"]["/api/v1/meeting-types/{meeting_type_id}/slots"]["get"]
    description = operation["description"]

    for fragment in ("14", "13 дней", "09:00", "18:00", "Europe/Moscow", "duration_minutes"):
        assert fragment in description


def test_every_contract_operation_is_served_with_the_same_statuses(app: FastAPI) -> None:
    contract = load_contract()
    served = app.openapi()

    assert set(contract["paths"]) == set(served["paths"])

    for path, contract_item in contract["paths"].items():
        contract_methods = set(contract_item) & _HTTP_METHODS
        served_methods = set(served["paths"][path]) & _HTTP_METHODS
        assert contract_methods == served_methods, path

        for method in contract_methods:
            contract_statuses = set(contract_item[method]["responses"])
            served_statuses = set(served["paths"][path][method]["responses"])
            assert contract_statuses == served_statuses, (method.upper(), path)


def test_served_schemas_match_the_contract(app: FastAPI) -> None:
    contract = load_contract()
    served = app.openapi()

    for path, contract_item in contract["paths"].items():
        for method in set(contract_item) & _HTTP_METHODS:
            contract_operation = contract_item[method]
            served_operation = served["paths"][path][method]

            contract_success = success_schema(contract, contract_operation)
            served_success = success_schema(served, served_operation)
            assert (contract_success is None) == (served_success is None), (method, path)
            if contract_success is not None and served_success is not None:
                assert schema_shape(contract, contract_success) == schema_shape(
                    served, served_success
                ), (method.upper(), path)

            contract_request = request_schema(contract_operation)
            served_request = request_schema(served_operation)
            assert (contract_request is None) == (served_request is None), (method, path)
            if contract_request is not None and served_request is not None:
                assert schema_shape(contract, contract_request) == schema_shape(
                    served, served_request
                ), (method.upper(), path, "request")
