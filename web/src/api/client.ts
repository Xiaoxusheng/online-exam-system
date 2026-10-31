import { queryClient } from '../app/queryClient'
import { useAuthStore } from '../stores/auth'

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ApiEnvelope<T> {
  data: T
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = useAuthStore.getState().token
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/v1${path}`, { ...init, headers })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '网络连接失败，请检查网络后重试')
  }

  if (response.status === 401 && path !== '/auth/login') {
    useAuthStore.getState().clear()
    queryClient.clear()
  }

  if (!response.ok) {
    let detail: ApiErrorEnvelope['error']
    try {
      detail = ((await response.json()) as ApiErrorEnvelope).error
    } catch {
      detail = undefined
    }
    throw new ApiError(
      response.status,
      detail?.code ?? 'REQUEST_FAILED',
      detail?.message ?? '请求失败，请稍后重试',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}
