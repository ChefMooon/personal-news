import React, { createContext, useContext, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { IPC, type ThemeInfo, type ThemeRow } from '../../../shared/ipc-types'

interface ThemeContextValue {
  theme: ThemeInfo
  customThemes: ThemeRow[]
  refreshThemes: () => Promise<void>
  setTheme: (id: string) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: { id: 'system', tokens: null },
  customThemes: [],
  refreshThemes: async () => {},
  setTheme: async () => {}
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

function applyTheme(theme: ThemeInfo): void {
  const root = document.documentElement

  // Remove any previously injected custom property style
  const existing = document.getElementById('custom-theme-vars')
  if (existing) existing.remove()

  let resolvedId = theme.id

  if (resolvedId === 'system') {
    resolvedId = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  root.setAttribute('data-theme', resolvedId)

  // If tokens are provided (future custom themes), inject CSS variables
  if (theme.tokens) {
    const style = document.createElement('style')
    style.id = 'custom-theme-vars'
    const vars = Object.entries(theme.tokens)
      .map(([k, v]) => `${k}: ${v};`)
      .join('\n  ')
    style.textContent = `[data-theme="${resolvedId}"] { ${vars} }`
    document.head.appendChild(style)
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [theme, setThemeState] = useState<ThemeInfo>({ id: 'system', tokens: null })
  const [customThemes, setCustomThemes] = useState<ThemeRow[]>([])

  const refreshThemes = async (): Promise<void> => {
    const rows = (await window.api.invoke(IPC.THEMES_LIST)) as ThemeRow[]
    setCustomThemes(rows)
  }

  useEffect(() => {
    Promise.all([window.api.invoke(IPC.SETTINGS_GET_THEME), window.api.invoke(IPC.THEMES_LIST)])
      .then(([t, rows]) => {
        const themeInfo = t as ThemeInfo
        setThemeState(themeInfo)
        setCustomThemes(rows as ThemeRow[])
        applyTheme(themeInfo)
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load theme preferences.')
      })
  }, [])

  // Watch system preference changes when using 'system' theme
  useEffect(() => {
    if (theme.id !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => applyTheme(theme)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = async (id: string): Promise<void> => {
    await window.api.invoke(IPC.SETTINGS_SET_THEME, id)
    const updated = (await window.api.invoke(IPC.SETTINGS_GET_THEME)) as ThemeInfo
    setThemeState(updated)
    applyTheme(updated)
  }

  return (
    <ThemeContext.Provider value={{ theme, customThemes, refreshThemes, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
