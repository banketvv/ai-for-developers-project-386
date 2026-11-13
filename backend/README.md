# Бэкенд «Календарь звонков»

API сервиса для бронирования звонков: владелец публикует события и свободные слоты времени, гости записываются на звонок.

Сервис однопользовательский: аутентификации нет, данные владельца задаются через переменные окружения.

## Стек

- **Python 3.13**
- **FastAPI** — HTTP API и OpenAPI-документация
- **SQLAlchemy 2.x** (async) + **aiosqlite** — работа с SQLite
- **Alembic** — миграции схемы БД
- **pydantic-settings** — конфигурация из `.env`
- **uv** — управление зависимостями и виртуальным окружением
- **ruff**, **mypy** — линтинг и проверка типов
- **pytest**, **pytest-asyncio**, **httpx** — тесты

## Требования

- [uv](https://docs.astral.sh/uv/) (версия 0.13+)
- Python 3.13 — uv поставит сам по `.python-version`

## Установка

```bash
cd backend
uv sync
```

Скопируйте шаблон окружения и при необходимости поправьте значения:

```bash
cp .env.example .env
```

В PowerShell:

```powershell
Copy-Item .env.example .env
```

Файл `.env` в git не попадает. Без него приложение запустится на значениях по умолчанию.

## Переменные окружения

| Переменная | По умолчанию | Назначение |
|---|---|---|
| `APP_NAME` | `Call Scheduler` | Название сервиса в OpenAPI |
| `ENVIRONMENT` | `local` | `local`, `test` или `production` |
| `DEBUG` | `false` | Подробные логи SQLAlchemy и traceback'и FastAPI |
| `DATABASE_URL` | `sqlite+aiosqlite:///./app.db` | Подключение к БД |
| `OWNER_NAME` | `Owner` | Имя владельца календаря |
| `OWNER_EMAIL` | `owner@example.com` | Email владельца |
| `OWNER_TIMEZONE` | `Europe/Moscow` | Часовой пояс владельца, например `Europe/Moscow` |
| `SESSION_COOKIE_NAME` | `guest_email` | Имя cookie, которой сервис опознаёт смотрящего |
| `SESSION_COOKIE_MAX_AGE` | `2592000` | Срок жизни cookie в секундах (30 дней) |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origin'ы фронтенда через запятую |

## Запуск

```bash
uv run fastapi dev app/main.py
```

- API: http://127.0.0.1:8000
- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc
- Health-check: http://127.0.0.1:8000/health

Проверка:

```bash
curl http://127.0.0.1:8000/health
# {"status":"ok"}
```

Для запуска без автоперезагрузки (ближе к продакшену):

```bash
uv run fastapi run app/main.py
```

## Сессия

Сервис не аутентифицирует, а опознаёт смотрящего по cookie с почтой:

- `GET /api/v1/session` — `{"email", "is_owner", "owner_name"}`: кто смотрит и владелец ли он;
- `POST /api/v1/session` с `{"email": "..."}` — ставит cookie, если почта совпадает с `OWNER_EMAIL` (без учёта регистра и пробелов), иначе `403` в общем конверте ошибок;
- `DELETE /api/v1/session` — очищает cookie.

Cookie `HttpOnly`, `SameSite=Lax`, срок 30 дней, `Secure` вне `local` и `test`. Ошибки API отдаются конвертом `{"error": {"code", "message", "fields"}}`.

## Структура

```
backend/
├── .env.example
├── .python-version
├── pyproject.toml
├── uv.lock
├── app/
│   ├── main.py              # create_app(), CORS, lifespan, обработчики ошибок
│   ├── api/
│   │   ├── deps.py          # зависимости: смотрящий, настройки
│   │   └── v1/
│   │       └── routes/
│   │           ├── health.py
│   │           └── session.py
│   ├── core/
│   │   ├── clock.py         # текущий момент и зависимость get_now
│   │   ├── config.py        # Settings из env/.env
│   │   └── errors.py        # AppError и единый конверт ошибок
│   ├── db/
│   │   ├── base.py          # DeclarativeBase и naming_convention
│   │   └── session.py       # async engine, SessionFactory, get_session
│   ├── schemas/             # Pydantic-схемы API
│   └── services/            # правила домена (сессия)
└── tests/
    ├── conftest.py          # приложение с подменёнными настройками и часами
    ├── test_health.py
    └── test_session.py
```

Соглашения:

- Настройки читаются только через `app.core.config.get_settings()`, env-переменные не читаются напрямую.
- Работа с БД — через async-сессии из `get_session()`, без глобальных сессий.
- Роутеры группируются по ресурсам в `app/api/v1/routes/`, бизнес-логика — в `app/services/` (появится вместе с моделями).
- Pydantic-схемы API отделены от ORM-моделей.
- Все даты хранятся в UTC, конвертация в часовой пояс — на границе API.

## База данных

По умолчанию используется SQLite-файл `app.db` в директории `backend/`. Файл создаётся автоматически при первом обращении и в git не попадает (`*.db`).

Для каждого соединения включаются:

- `PRAGMA foreign_keys=ON` — внешние ключи в SQLite по умолчанию выключены;
- `PRAGMA journal_mode=WAL` — параллельные чтения во время записи.

Alembic добавлен в зависимости; каталог миграций появится вместе с первыми моделями. Для SQLite миграции настраиваются с `render_as_batch=True`, так как SQLite не поддерживает большинство `ALTER TABLE`.

## Тесты

```bash
uv run pytest
```

Конфигурация pytest — в `pyproject.toml` (`asyncio_mode = "auto"`, `testpaths = ["tests"]`).

## Линтеры и типы

```bash
uv run ruff check --fix .
uv run ruff format .
uv run mypy app tests
```

Правила ruff и mypy заданы в `pyproject.toml`: длина строки 99, `target-version = py313`, для mypy включены обязательные аннотации типов.

## Фронтенд

Фронтенд — отдельное приложение на TypeScript, Vite и shadcn/ui. В dev-режиме Vite обычно работает на `http://localhost:5173`; этот origin уже разрешён в `CORS_ORIGINS`. Если порт другой — добавьте его в `.env`.

## Статус

Готово:

- каркас приложения FastAPI с фабрикой `create_app()`;
- конфигурация через `.env`;
- слой БД (async engine и сессии SQLite);
- `GET /health` и тест на него;
- опознание смотрящего по cookie: вход владельца и смена почты (`/api/v1/session`).

В планах:

- модели `MeetingType` и `Booking` и миграции Alembic;
- API `/api/v1/meeting-types`, `/api/v1/meeting-types/{id}/slots`, `/api/v1/bookings`;
- защита от двойного бронирования слота (уникальный индекс + `409 Conflict`).
