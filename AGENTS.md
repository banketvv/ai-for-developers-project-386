# AGENTS.md

## Repo map

- `backend/` — FastAPI. ASGI entrypoint is `app.main:app`. Endpoints: `GET /health`, `/api/v1/session`, `/api/v1/meeting-types` (list, create, detail, update, delete), `/api/v1/meeting-types/{id}/slots`, `/api/v1/bookings` (list, create) and `/api/v1/bookings/{id}` (detail). Both tables (`meeting_types`, `bookings`) exist and are created by Alembic. API models are generated from the contract into `app/schemas/contract.py`.
- `frontend/` — Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui. Landing page at `/`, meeting-type list at `/booking`, type calendar at `/booking/{meetingTypeId}`, booking form at `/booking/{meetingTypeId}/{start}`, upcoming bookings at `/bookings`, booking confirmation at `/bookings/{bookingId}`, owner login at `/owner`, type creation form at `/owner/types/new`, type edit form at `/owner/types/{meetingTypeId}/edit`. API client in `src/lib/api.ts`, generated types in `src/api/schema.d.ts`, display formatting in `src/lib/datetime.ts`, network in tests is intercepted by MSW.
- `api/` — TypeSpec source of truth for the HTTP API, plus the generated `openapi/openapi.yaml`. `api/README.md` explains the pipeline and how to change it.
- `mise.toml` at the root — tool versions and all dev tasks. Local workflow and CI both go through mise.
- `Dockerfile` and `render.yaml` — multi-stage image (Vite + FastAPI) and Render Blueprint. The container applies migrations, serves the built frontend from FastAPI and listens on `PORT`; Render sets that variable.
- `opencode.json` — project OpenCode config; connects the hosted Render MCP server (`https://mcp.render.com/mcp`) for deploys and logs.
- `backend/README.md` — backend setup and conventions. Root `README.md` is the Hexlet template.

## Commands

Run from the repo root unless noted.

```bash
mise trust && mise install   # fresh clone only
mise run setup               # uv sync + npm install (local, includes api/)
mise run setup:ci            # uv sync + npm ci (lockfile-strict)
mise run dev                 # backend :8000 + frontend :5173 together
mise run check               # contract + backend lint/test + frontend lint/build
mise run api:generate        # TypeSpec → OpenAPI → TS-типы и Pydantic-модели
mise run api:check           # упасть, если артефакты контракта устарели
mise run e2e                 # браузерные E2E-тесты Playwright (поднимает оба сервера)
mise run e2e:install         # поставить Chromium для Playwright (один раз)
mise run backend:format      # ruff check --fix + ruff format
mise tasks ls
```

- Backend only: `mise run backend:dev`, `backend:migrate`, `backend:lint`, `backend:test`.
- Frontend only: `mise run frontend:dev`, `frontend:lint`, `frontend:test`, `frontend:build`.
- Frontend tests in watch mode: `mise run frontend:test:watch`.
- Browser tests: `mise run e2e` runs Playwright in Chromium against the real FastAPI and Vite. They start their own servers on `127.0.0.1:8001`/`:5174` with a throwaway `backend/e2e.db` and a fixed clock (`FAKE_NOW`), and are **not** part of `mise run check` (they need a browser). Specs live in `frontend/e2e/**/*.e2e.ts` — the `.e2e.ts` suffix keeps Vitest away from them.
- Single backend test: `cd backend && uv run pytest tests/test_health.py -k health`.
- Frontend tests are Vitest + Testing Library on jsdom, colocated as `*.test.tsx`. `npm run lint` is **oxlint**, not ESLint. `npm run build` (`tsc -b && vite build`) is the only TypeScript typecheck — run it after TS changes.
- `mise run check` runs its six tasks in parallel; one failure does not stop the others, but the run exits non-zero.
- `api:check` regenerates the contract artifacts and fails when they differ from git — run `mise run api:generate` and commit the result after any `.tsp` change.

## Non-obvious constraints

- **Do not remove** `[tool.uv.build-backend] module-name = "app"` and `module-root = ""` from `backend/pyproject.toml`. The project is named `backend`, but the package directory is `app`; without this, `uv sync`/build fails.
- **TypeScript 7 removed `baseUrl`.** Keep the `@/*` alias only through `compilerOptions.paths` in both `tsconfig.json` and `tsconfig.app.json`. Adding `baseUrl` fails with TS5102.
- **shadcn CLI 4.x** has no `--style`/`--base-color` on `init`. `frontend/components.json` deliberately uses legacy `"style": "new-york"`, `"baseColor": "zinc"`, CSS variables; the CLI maps new-york to the `new-york-v4` registry. Add components from `frontend/` with `npx shadcn@latest add <name>`; never hand-edit `src/components/ui/*`.
- shadcn v4 components import `cn` from the `cn` package and primitives from `radix-ui` (not `@radix-ui/react-*`). `src/lib/utils.ts` re-exports `cn`.
- Tailwind v4 is CSS-first: there is no `tailwind.config.js`. Theme tokens live as CSS variables in `src/index.css`.
- **The API contract is the source of truth.** `api/*.tsp` (TypeSpec) describes every route and model; `api/openapi/openapi.yaml`, `frontend/src/api/schema.d.ts` and `backend/app/schemas/contract.py` are generated and committed. Never hand-edit generated files; change the `.tsp` and run `mise run api:generate`. `backend/tests/test_contract.py` fails when served routes, status codes, or request/response shapes drift from the OpenAPI file.
- Backend style is enforced by `pyproject.toml`: ruff line length 99, `py313`, mypy `disallow_untyped_defs`. New backend code must be typed; run `mise run backend:format` before checking. The generated `app/schemas/contract.py` is excluded from ruff but still type-checked.
- The DB is async SQLAlchemy + SQLite. `app/db/session.py` sets `PRAGMA foreign_keys=ON` and WAL; the DB file is `backend/app.db` (ignored). Alembic migrations live in `backend/migrations/` (`uv run alembic upgrade head`); they are excluded from ruff and mypy.
- Read settings only through `app.core.config.get_settings()`. The service has one predefined owner from env and **no authentication by design** — don't add auth without asking.
- `FAKE_NOW` (settings `fake_now`) freezes the backend clock; it exists for the Playwright suite only and must not be set in production.
- Commit only `.env.example`. `backend/.env` and `frontend/.env.local` are gitignored and loaded by mise when present. Dev CORS allows `http://localhost:5173` / `127.0.0.1:5173`.
- `.github/workflows/hexlet-check.yml` is auto-generated: never edit or rename it, and never rename the repository — Hexlet grading depends on it.
- `.github/workflows/ci.yml` runs on every push: `mise run setup:ci` then `mise run check`. Keep `frontend/package-lock.json` committed or `npm ci` fails.
- `app/__init__.py` still contains the uv scaffold `main()` that prints "Hello from backend!". Ignore it; the real entrypoint is `app.main:app`.
- On Windows mise is installed via WinGet; a non-interactive shell may not have `mise` on PATH until restarted. Prefer `mise run ...` over raw `uv`/`npm` so versions come from `mise.toml`.

## Conventions

- Commit messages follow **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`,
  `refactor:`, `ci:` …) — release-please uses them for versioning/changelog.
  commitlint runs on every commit; the header fits 120 characters and each body line 100.
  **Every commit names its ticket**: the header ends with the issue it serves, e.g.
  `feat: add owner session login (#15)`. A commit serving no single ticket references the spec
  (`(#14)`); merges made by `implement-spec` are the only exception.
  **Nothing lands on `main` as a merge commit** (`chore: merge origin/main` and the like): its
  history stays linear. Bring `main` into a worktree's branch with `git fetch origin && git rebase
origin/main`, never `git merge`. The one exception is `implement-spec`, whose own steps win: the
  merges it makes between its implementer branches and its integration branch are allowed, and so
  is bringing `main` in before it marks the pull request ready (below). The squash of that pull
  request keeps `main` linear.

## Releases

Releases are automated by **release-please** (`.github/workflows/release-please.yml`). It parses
Conventional Commits on `main` and keeps an open release PR that bumps `version.txt`, updates
`CHANGELOG.md` and, once merged, creates the tag and GitHub Release.

- The squash merge uses the **pull request title** as the commit subject, so the title must be a
  Conventional Commit (`feat(api): …`, `fix: …`). `ci`, `chore`, `docs` and `test` do not bump the
  version; `feat` bumps minor, `fix` patches, `feat!`/`fix!` or a `BREAKING CHANGE:` footer bumps
  major.
- GitHub appends `(#<PR>)` to the squash subject; release-please ignores it and links the PR in the
  changelog. Tickets are closed by `Closes #N` in the PR body, not by the subject.
- The first release starts at `0.1.0` (`initial-version` + `.release-please-manifest.json`), and
  `bootstrap-sha` stops the changelog from walking the whole history.
- The workflow needs **Settings → Actions → General → Allow GitHub Actions to create and approve
  pull requests**. With the default `GITHUB_TOKEN`, CI does not run on the release PR itself.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `banketvv/ai-for-developers-project-386`, driven by the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage roles, each label string equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
