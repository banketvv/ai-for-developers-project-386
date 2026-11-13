const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type ErrorEnvelope = {
  error?: {
    code?: string
    message?: string
    fields?: Record<string, string>
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
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

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response: Response
  try {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }
    response = await fetch(apiUrl(path), {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Не удалось связаться с сервером')
  }

  if (!response.ok) {
    const envelope = await readJson<ErrorEnvelope>(response)
    const error = envelope?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'unknown_error',
      error?.message ?? 'Сервер ответил ошибкой',
      error?.fields ?? {},
    )
  }

  return (await readJson<T>(response)) as T
}
