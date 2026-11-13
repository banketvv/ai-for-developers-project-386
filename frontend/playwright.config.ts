import { defineConfig, devices } from '@playwright/test'

const API_URL = 'http://127.0.0.1:8001'
const WEB_URL = 'http://127.0.0.1:5174'
const OWNER_EMAIL = 'owner@example.com'

// Понедельник 08:00 по Москве: в окне гарантированно есть свободные слоты
// независимо от дня недели и времени, когда запустили тесты.
const FAKE_NOW = '2026-11-16T05:00:00Z'

export default defineConfig({
  testDir: './e2e',
  // Только *.e2e.ts: файлы Vitest (*.test.tsx) сюда не попадают.
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  expect: { timeout: 10_000 },
  use: {
    baseURL: WEB_URL,
    // Пояс браузера фиксирован: интерфейс показывает время смотрящего.
    timezoneId: 'Europe/Moscow',
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'node ../frontend/e2e/reset-db.mjs && uv run alembic upgrade head && uv run uvicorn app.main:app --host 127.0.0.1 --port 8001',
      cwd: '../backend',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ENVIRONMENT: 'test',
        DATABASE_URL: 'sqlite+aiosqlite:///./e2e.db',
        OWNER_NAME: 'Владелец календаря',
        OWNER_EMAIL,
        OWNER_TIMEZONE: 'Europe/Moscow',
        CORS_ORIGINS: WEB_URL,
        FAKE_NOW,
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_URL: API_URL,
      },
    },
  ],
})
