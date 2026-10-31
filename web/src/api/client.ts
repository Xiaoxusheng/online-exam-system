import { queryClient } from '../app/queryClient'
import { useAuthStore } from '../stores/auth'
import type { ListResult, Pagination } from '../types'

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
  pagination?: Pagination
}

interface ApiErrorEnvelope {
  error?: { code?: string; message?: string }
}

/** Build a query string, skipping empty values so filters stay readable. */
export function toQuery<T extends object>(params: T): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

async function send(path: string, init: RequestInit = {}): Promise<Response> {
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

  return response
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await send(path, init)
  if (response.status === 204) {
    return undefined as T
  }
  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

/** List endpoints answer `{ data: [...], pagination: {...} }`. */
export async function apiListRequest<T>(path: string, init: RequestInit = {}): Promise<ListResult<T>> {
  const response = await send(path, init)
  const payload = (await response.json()) as ApiEnvelope<T[]>
  return {
    items: payload.data ?? [],
    pagination: payload.pagination ?? { page: 1, page_size: payload.data?.length ?? 0, total: payload.data?.length ?? 0 },
  }
}

/**
 * WebSocket endpoint on the same API root. With no VITE_API_BASE_URL the socket
 * rides on the page origin (the dev server proxies `/api` with ws upgrade).
 */
export function apiSocketUrl(path: string): string {
  const target = API_BASE || window.location.origin
  const url = new URL(`${target}/api/v1${path}`)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}
