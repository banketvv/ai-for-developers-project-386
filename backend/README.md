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
| `FAKE_NOW` | — | Только для E2E: фиксирует «сейчас» (ISO 8601), в production не задаётся |

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

## Типы встреч

`GET /api/v1/meeting-types` отдаёт список (новые сверху), `GET /api/v1/meeting-types/{id}` — один тип; оба доступны всем:

```json
{
  "id": 7,
  "title": "Знакомство",
  "description": null,
  "duration_minutes": 30,
  "created_at": "2026-11-16T09:00:00",
  "bookings_count": 3,
  "has_available_slots": true,
  "duration_locked": true
}
```

`bookings_count` считает все брони типа — это число показывает предупреждение об удалении. `duration_locked` считает сервер по предстоящим броням: пока они есть, длительность заперта, и интерфейс выключает поле. Правка длительности запрещена, пока у типа есть предстоящие брони: `409 duration_locked`; название и описание правятся всегда. Без предстоящих броней, даже если прошедшие остались, `duration_locked` равен `false` и длительность меняется. `POST`, `PATCH` и `DELETE` доступны только владельцу, гостю — `403 forbidden`. `PATCH` принимает любое подмножество полей создания: название после обрезки 1–100 символов, описание до 1000 (пустое — без описания), длительность 15/30/45/60; ошибки полей — `422 validation_error`. `DELETE` отвечает `204` и каскадно удаляет брони типа, неизвестный тип — `404 not_found`.

## Слоты

`GET /api/v1/meeting-types/{id}/slots` отдаёт все слоты фиксированного окна «сегодня + 13 дней» по возрастанию, занятые тоже:

```json
{"slots": [{"start": "2026-11-16T06:00:00Z", "available": true}]}
```

Сетка — будни 09:00–18:00 в `OWNER_TIMEZONE`, шаг равен длительности типа; слот, не влезающий в 18:00 целиком, отбрасывается. Прошедшие слоты отсекает сервер. Слот занят, если пересекается с любой предстоящей бронью, независимо от типа встречи. Параметров и пагинации нет; неизвестный тип — `404`.

## Брони

`POST /api/v1/bookings` с `{"meeting_type_id", "start", "guest_name", "guest_email"}` создаёт бронь и ставит cookie `guest_email`:

```json
{
  "id": 1,
  "start": "2026-11-16T06:00:00Z",
  "guest_name": "Иван",
  "guest_email": "guest@example.com",
  "created_at": "2026-11-16T09:00:00",
  "meeting_type": {"id": 7, "title": "Знакомство", "duration_minutes": 60}
}
```

- `start` обязан быть началом слота из текущей сетки типа, иначе `422` с `fields.start`;
- имя после обрезки — 1–100 символов, у почты проверяется формат; ошибки полей приходят в конверте;
- у гостя не больше одной предстоящей брони на тип: `409 already_booked` проверяется раньше занятости;
- занятый слот — `409 slot_taken`, гонку разрешает `UNIQUE(meeting_type_id, start)`: проигравший получает тот же `409`;
- неизвестный тип — `404`, неуспешная попытка не меняет cookie.

`GET /api/v1/bookings/{id}` отдаёт ту же форму. Гость видит только свою бронь, владелец — любую, остальным `404` без утечки данных.

`GET /api/v1/bookings` отдаёт предстоящие брони по возрастанию начала. Гость видит только брони своей почты, а без cookie получает пустой список; владелец видит все брони с именем и почтой гостя.

## Контракт API

Источник правды — TypeSpec в `api/` в корне репозитория. Pydantic-модели генерируются из
OpenAPI в `app/schemas/contract.py`; руками генерируемые файлы не правят:

```bash
mise run api:generate   # TypeSpec → OpenAPI → Pydantic-модели
mise run api:check      # проверить, что артефакты не устарели
```

`app/schemas/base.py` — база сгенерированных моделей: обрезает строки, трактует пустую строку в
необязательном поле как `null` и сериализует моменты времени в UTC с суффиксом `Z`.
Нормализация почты и приведение времени к наивному UTC живут в наследниках
(`app/schemas/booking.py`). `app/api/responses.py` документирует коды ошибок у маршрутов.

Совпадение сервера с контрактом проверяет `tests/test_contract.py`: набор путей и методов, коды
ответов и формы запросов/успешных ответов. Если маршрут или модель разошлись со спецификацией,
этот тест падает.

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
│   │   ├── cookies.py       # установка и очистка cookie сессии
│   │   ├── deps.py          # зависимости: сессия БД, смотрящий, владелец, часы
│   │   ├── responses.py     # описания ошибок для OpenAPI
│   │   └── v1/
│   │       └── routes/
│   │           ├── bookings.py
│   │           ├── health.py
│   │           ├── meeting_types.py
│   │           ├── session.py
│   │           └── slots.py
│   ├── core/
│   │   ├── clock.py         # текущий момент и зависимость get_now
│   │   ├── config.py        # Settings из env/.env
│   │   └── errors.py        # AppError, not_found() и единый конверт ошибок
│   ├── db/
│   │   ├── base.py          # DeclarativeBase и naming_convention
│   │   ├── models/          # MeetingType, Booking
│   │   └── session.py       # async engine, SessionFactory, get_session
│   ├── schemas/
│   │   ├── base.py          # ContractModel: нормализация и сериализация
│   │   ├── contract.py      # сгенерированные Pydantic-модели (не править)
│   │   └── ...              # наследники с правилами домена
│   └── services/            # правила домена: сессия, типы встреч, слоты, брони
├── migrations/              # Alembic: env.py и ревизии
└── tests/
    ├── conftest.py          # приложение с подменёнными настройками, часами и БД
    ├── support.py           # общие помощники: вход владельца, создание типа
    ├── test_bookings.py
    ├── test_contract.py     # сверка сервера с OpenAPI-контрактом
    ├── test_health.py
    ├── test_meeting_type_edit.py
    ├── test_meeting_types.py
    ├── test_migrations.py
    ├── test_session.py
    └── test_slots.py
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

Схема живёт в миграциях Alembic (`migrations/`, `render_as_batch=True` для SQLite). Адрес БД берётся из `DATABASE_URL`, если он не задан программно:

```bash
mise run backend:migrate           # создать или обновить схему
uv run alembic revision -m "..."   # новая ревизия
```

`mise run backend:dev` применяет миграции перед запуском сервера.

В таблицах `meeting_types` и `bookings` длительности ограничены `CHECK`-ограничением, а пара «тип встречи + начало слота» уникальна; удаление типа каскадно удаляет его брони.

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
- опознание смотрящего по cookie: вход владельца и смена почты (`/api/v1/session`);
- модели `MeetingType` и `Booking`, первая миграция Alembic;
- список, создание, правка и удаление типа встречи (`/api/v1/meeting-types`), изменения — только владельцу;
- слоты окна типа встречи (`/api/v1/meeting-types/{id}/slots`) с признаком занятости;
- создание брони (`POST /api/v1/bookings`) с проверкой правил и cookie гостя, чтение одной брони (`GET /api/v1/bookings/{id}`), список предстоящих броней (`GET /api/v1/bookings`) для гостя и владельца.
