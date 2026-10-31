import dayjs from 'dayjs'

const DATE_TIME = 'YYYY-MM-DD HH:mm'
const DATE = 'YYYY-MM-DD'

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format(DATE_TIME) : '—'
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format(DATE) : '—'
}

export function formatTime(value?: string | null): string {
  if (!value) return '—'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('HH:mm:ss') : '—'
}

export function formatScore(value?: number | null, digits = 2): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

export function formatCount(value?: number | null): string {
  if (value === undefined || value === null) return '—'
  return value.toLocaleString('zh-CN')
}

/** Seconds -> `1 小时 20 分` / `35 分 10 秒`, used by countdowns and durations. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${String(secs).padStart(2, '0')} 秒`
  return `${secs} 秒`
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}
