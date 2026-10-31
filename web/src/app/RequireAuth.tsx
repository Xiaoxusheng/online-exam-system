import { useEffect, useState, type ReactNode } from 'react'
import { Spin } from 'antd'
import { Navigate, useLocation } from 'react-router-dom'
import { refreshSession } from '../api/client'
import { hasValidSession, useAuthStore } from '../stores/auth'

type Gate = 'idle' | 'refreshing' | 'denied'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((state) => state.token)
  const expiresAt = useAuthStore((state) => state.expiresAt)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const location = useLocation()

  const valid = hasValidSession(token, expiresAt)
  const [gate, setGate] = useState<Gate>(() => (valid ? 'idle' : refreshToken ? 'refreshing' : 'denied'))

  // An expired access token is not a logout: try the refresh token once before
  // sending the user back to the login screen.
  useEffect(() => {
    if (valid) {
      setGate('idle')
      return
    }
    if (!refreshToken) {
      setGate('denied')
      return
    }
    let cancelled = false
    setGate('refreshing')
    refreshSession().then((ok) => {
      if (!cancelled) setGate(ok ? 'idle' : 'denied')
    })
    return () => {
      cancelled = true
    }
  }, [valid, refreshToken])

  if (gate === 'refreshing') {
    return (
      <div className="route-loading route-loading-full">
        <Spin />
      </div>
    )
  }
  if (gate === 'denied') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <>{children}</>
}
