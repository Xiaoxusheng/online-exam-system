import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ThemeState {
  mode: 'light' | 'dark'
  toggle: () => void
}

export const useThemeMode = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'light',
      toggle: () => set((state) => ({ mode: state.mode === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'online-exam.theme' },
  ),
)
