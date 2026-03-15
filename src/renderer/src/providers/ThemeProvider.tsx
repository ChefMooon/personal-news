import React, { createContext, useContext, useEffect, useState } from 'react'
import type { ThemeInfo } from '../../../shared/ipc-types'

interface ThemeContextValue {
  theme: ThemeInfo
  setTheme: (id: string) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: { id: 'system', tokens: null },
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

  useEffect(() => {
    window.api
      .invoke('settings:getTheme')
      .then((t) => {
        const themeInfo = t as ThemeInfo
        setThemeState(themeInfo)
        applyTheme(themeInfo)
      })
      .catch(console.error)
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
    await window.api.invoke('settings:setTheme', id)
    const updated = (await window.api.invoke('settings:getTheme')) as ThemeInfo
    setThemeState(updated)
    applyTheme(updated)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
