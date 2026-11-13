// Чистая база перед каждым прогоном E2E: тесты не должны видеть прошлые данные.
// Запускается из backend/ (см. webServer.cwd в playwright.config.ts).
import { rm } from 'node:fs/promises'

for (const suffix of ['', '-wal', '-shm']) {
  await rm(`e2e.db${suffix}`, { force: true })
}
