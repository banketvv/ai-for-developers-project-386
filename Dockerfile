# syntax=docker/dockerfile:1

# --- Сборка фронтенда -------------------------------------------------------
FROM node:22-alpine AS frontend

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# Продакшен-сборка ходит в API того же origin: FastAPI ниже отдаёт и статику,
# и /api, поэтому CORS в контейнере не нужен.
RUN npm run build

# --- Бэкенд и статика -------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS runtime

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

WORKDIR /app

# Зависимости ставятся отдельным слоем: правка кода не пересобирает их.
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
RUN uv sync --frozen --no-dev

COPY --from=frontend /frontend/dist /app/static

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

# Миграции применяются при старте, сервер слушает порт из PORT.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\""]
