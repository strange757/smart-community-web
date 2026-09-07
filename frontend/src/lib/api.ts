interface Envelope<T> {
  data: T
  requestId: string
}

interface ErrorPayload {
  code?: string
  message?: string
  requestId?: string
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const sessionKey = "smart-community-session"

const unauthorizedListeners = new Set<() => void>()

export function subscribeToUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener)
  return () => unauthorizedListeners.delete(listener)
}

function invalidateSession(): void {
  sessionStorage.removeItem(sessionKey)
  unauthorizedListeners.forEach((listener) => listener())
}

export function currentToken(): string | null {
  const raw = sessionStorage.getItem(sessionKey)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { token?: unknown }
    return typeof parsed.token === "string" && parsed.token ? parsed.token : null
  } catch {
    return null
  }
}

async function responseFor(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Accept")) headers.set("Accept", "application/json")
  if (init?.body !== undefined && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json")
  headers.set("X-Request-Id", crypto.randomUUID())
  const token = currentToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const response = await fetch(`/api/v1${path}`, { ...init, headers })
  if (!response.ok) {
    const error = await response.json().catch(() => null) as ErrorPayload | null
    if (response.status === 401) invalidateSession()
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      error?.message ?? "请求失败",
      error?.requestId ?? response.headers.get("X-Request-Id") ?? undefined,
    )
  }

  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await responseFor(path, init)
  const payload = await response.json().catch(() => null) as Envelope<T> | null

  if (!payload || !("data" in payload)) {
    throw new ApiError(
      response.status,
      "INVALID_RESPONSE",
      "服务器返回了无效响应",
      response.headers.get("X-Request-Id") ?? undefined,
    )
  }

  return payload.data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  blob: async (path: string, signal?: AbortSignal) => (await responseFor(path, { signal, headers: { Accept: "image/jpeg,image/png,image/webp" } })).blob(),
  upload: <T>(path: string, body: FormData, signal?: AbortSignal) => request<T>(path, { method: "POST", body, signal }),
  post: <T>(path: string, body?: unknown, headers?: HeadersInit, signal?: AbortSignal) => request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    signal,
  }),
}
