# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Окружение

Клиент API берёт адрес бэкенда из `VITE_API_URL` (по умолчанию `http://localhost:8000`).
Скопируйте шаблон и при необходимости поправьте значение; `.env.local` в git не попадает:

```bash
cp .env.example .env.local
```

## Клиент API

Клиент не пишется руками: типы путей и схем генерируются из OpenAPI-контракта в
`src/api/schema.d.ts`, а `src/lib/api.ts` собирает на них типизированный клиент
(`openapi-fetch`). Сгенерированный файл не правится — после изменения `api/*.tsp`
в корне репозитория выполните `mise run api:generate`.

Модули `src/lib/meeting-types.ts`, `bookings.ts`, `slots.ts` и `session.tsx` — тонкие
обёртки над клиентом: они возвращают данные или бросают `ApiError` с машинным кодом.
Подробнее о конвейере — `api/README.md`.

## Браузерные тесты

`mise run e2e` запускает Playwright в Chromium против настоящего стека: тесты сами
поднимают FastAPI на `127.0.0.1:8001` (временная база `backend/e2e.db`, часы зафиксированы
через `FAKE_NOW`) и Vite на `127.0.0.1:5174`, а после прогона их гасят. Первый запуск
требует браузера: `mise run e2e:install`.

Сценарии лежат в `e2e/*.e2e.ts` и проверяют то, чего не видит jsdom: путь гостя от
календаря до подтверждения, пустое состояние предстоящих, а также вход владельца,
создание, правку и удаление типа встречи. Суффикс `.e2e.ts` выбран специально: Vitest
такие файлы не подхватывает, а `mise run check` остаётся быстрым и браузера не требует.

Отлаживать удобнее в интерактивном режиме:

```bash
mise run e2e -- --ui
```

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
