import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  token: string | null
  expiresAt: string | null
  user: User | null
  setSession: (session: { token: string; expiresAt: string; user: User }) => void
  setUser: (user: User) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      user: null,
      setSession: ({ token, expiresAt, user }) => set({ token, expiresAt, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, expiresAt: null, user: null }),
    }),
    {
      name: 'online-exam.auth',
      partialize: (state) => ({ token: state.token, expiresAt: state.expiresAt, user: state.user }),
    },
  ),
)

export function hasValidSession(token: string | null, expiresAt: string | null): boolean {
  if (!token) return false
  if (!expiresAt) return true
  return new Date(expiresAt).getTime() > Date.now()
}
