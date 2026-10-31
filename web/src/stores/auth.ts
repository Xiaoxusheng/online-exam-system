import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  token: string | null
  expiresAt: string | null
  refreshToken: string | null
  refreshExpiresAt: string | null
  user: User | null
  setSession: (session: {
    token: string
    expiresAt: string
    refreshToken?: string
    refreshExpiresAt?: string
    user: User
  }) => void
  setUser: (user: User) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      refreshToken: null,
      refreshExpiresAt: null,
      user: null,
      setSession: ({ token, expiresAt, refreshToken, refreshExpiresAt, user }) =>
        set((state) => ({
          token,
          expiresAt,
          user,
          refreshToken: refreshToken ?? state.refreshToken,
          refreshExpiresAt: refreshExpiresAt ?? state.refreshExpiresAt,
        })),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, expiresAt: null, refreshToken: null, refreshExpiresAt: null, user: null }),
    }),
    {
      name: 'online-exam.auth',
      partialize: (state) => ({
        token: state.token,
        expiresAt: state.expiresAt,
        refreshToken: state.refreshToken,
        refreshExpiresAt: state.refreshExpiresAt,
        user: state.user,
      }),
    },
  ),
)

export function hasValidSession(token: string | null, expiresAt: string | null): boolean {
  if (!token) return false
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() > Date.now()
}
