import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { hasValidSession, useAuthStore } from '../stores/auth'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  const expiresAt = useAuthStore((state) => state.expiresAt)
  const location = useLocation()

  if (!hasValidSession(token, expiresAt)) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}
