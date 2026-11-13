import { request } from '@playwright/test'

export const API_URL = 'http://127.0.0.1:8001'
export const OWNER_EMAIL = 'owner@example.com'

export type SeededMeetingType = {
  id: number
  title: string
  duration_minutes: number
}

/**
 * Готовит данные через настоящий API, а не через интерфейс: тест проверяет
 * путь гостя, а создание типа уже покрыто тестом владельца.
 */
export async function seedMeetingType(
  title: string,
  durationMinutes = 30,
): Promise<SeededMeetingType> {
  const context = await request.newContext({ baseURL: API_URL })
  try {
    const login = await context.post('/api/v1/session', {
      data: { email: OWNER_EMAIL },
    })
    if (!login.ok()) {
      throw new Error(`Вход владельца не удался: ${login.status()}`)
    }

    const created = await context.post('/api/v1/meeting-types', {
      data: { title, duration_minutes: durationMinutes },
    })
    if (!created.ok()) {
      throw new Error(
        `Создание типа не удалось: ${created.status()} ${await created.text()}`,
      )
    }
    return (await created.json()) as SeededMeetingType
  } finally {
    await context.dispose()
  }
}
