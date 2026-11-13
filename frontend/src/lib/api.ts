import createClient from 'openapi-fetch'
import type { paths } from '@/api/schema'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string>
  }
}

type ApiResult<T> = {
  data?: T
  error?: unknown
  response: Response
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`
}

/**
 * Типизированный клиент, собранный из OpenAPI-контракта: пути, тела и ответы
 * проверяет компилятор. Cookie отправляется всегда: сервис узнаёт смотрящего
 * только по ней.
 */
export const apiClient = createClient<paths>({
  baseUrl: API_BASE_URL,
  credentials: 'include',
  // Стрелка зовёт текущий `fetch` в момент запроса: так MSW перехватывает сеть,
  // даже если клиент создан до старта тестового сервера.
  fetch: (request) => fetch(request),
})

/**
 * Приводит ответ клиента к данным или к `ApiError` с машинным кодом.
 * Сеть и 5xx остаются разными состояниями для интерфейса.
 */
export async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  let result: ApiResult<T>
  try {
    result = await request
  } catch {
    throw new ApiError(0, 'network_error', 'Не удалось связаться с сервером')
  }

  if (!result.response.ok) {
    const envelope = result.error as ErrorEnvelope | undefined
    const error = envelope?.error
    throw new ApiError(
      result.response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'Сервер ответил ошибкой',
      error?.fields ?? {},
    )
  }

  return result.data as T
}
