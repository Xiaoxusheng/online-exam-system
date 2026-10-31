import { ApiError } from '../api/client'

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return '你没有权限执行该操作'
    if (error.status === 0) return error.message
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return '操作失败，请稍后重试'
}

export function isForbidden(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}
