import React, { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { IPC, type ThemeRow } from '../../../shared/ipc-types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'

export const THEME_TOKEN_DEFS: Array<{ key: string; label: string }> = [
  { key: '--background', label: 'Background' },
  { key: '--foreground', label: 'Foreground' },
  { key: '--card', label: 'Card' },
  { key: '--card-foreground', label: 'Card Foreground' },
  { key: '--popover', label: 'Popover' },
  { key: '--popover-foreground', label: 'Popover Foreground' },
  { key: '--primary', label: 'Primary' },
  { key: '--primary-foreground', label: 'Primary Foreground' },
  { key: '--secondary', label: 'Secondary' },
  { key: '--secondary-foreground', label: 'Secondary Foreground' },
  { key: '--muted', label: 'Muted' },
  { key: '--muted-foreground', label: 'Muted Foreground' },
  { key: '--accent', label: 'Accent' },
  { key: '--accent-foreground', label: 'Accent Foreground' },
  { key: '--destructive', label: 'Destructive' },
  { key: '--destructive-foreground', label: 'Destructive Foreground' },
  { key: '--border', label: 'Border' },
  { key: '--input', label: 'Input' },
  { key: '--ring', label: 'Ring' }
]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function normalizeHex(value: string): string {
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toLowerCase()}`
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((ch) => ch + ch)
      .join('')
      .toLowerCase()}`
  }
  return '#000000'
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((part) => clamp(Math.round(part), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function hslToHex(h: number, sPercent: number, lPercent: number): string {
  const s = clamp(sPercent, 0, 100) / 100
  const l = clamp(lPercent, 0, 100) / 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hPrime = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hPrime % 2) - 1))

  let r1 = 0
  let g1 = 0
  let b1 = 0

  if (hPrime >= 0 && hPrime < 1) {
    r1 = c
    g1 = x
  } else if (hPrime < 2) {
    r1 = x
    g1 = c
  } else if (hPrime < 3) {
    g1 = c
    b1 = x
  } else if (hPrime < 4) {
    g1 = x
    b1 = c
  } else if (hPrime < 5) {
    r1 = x
    b1 = c
  } else {
    r1 = c
    b1 = x
  }

  const m = l - c / 2
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255)
}

function hexToHsl(hex: string): string {
  const normalized = normalizeHex(hex)
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta > 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6
    } else if (max === g) {
      h = (b - r) / delta + 2
    } else {
      h = (r - g) / delta + 4
    }
    h *= 60
  }

  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))

  const roundedHue = Math.round(((h % 360) + 360) % 360)
  const roundedSat = Math.round(s * 100)
  const roundedLight = Math.round(l * 100)

  return `${roundedHue} ${roundedSat}% ${roundedLight}%`
}

function parseHsl(value: string): { h: number; s: number; l: number } | null {
  const parts = value
    .trim()
    .replace(/\s+/g, ' ')
    .match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%$/)

  if (!parts) {
    return null
  }

  const h = Number(parts[1])
  const s = Number(parts[2])
  const l = Number(parts[3])

  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    return null
  }

  return {
    h,
    s: clamp(s, 0, 100),
    l: clamp(l, 0, 100)
  }
}

function toColorInputValue(tokenValue: string): string {
  const parsed = parseHsl(tokenValue)
  if (!parsed) {
    return '#000000'
  }
  return hslToHex(parsed.h, parsed.s, parsed.l)
}

function buildDefaultTokens(): Record<string, string> {
  return Object.fromEntries(THEME_TOKEN_DEFS.map((def) => [def.key, '0 0% 0%']))
}

function withRequiredTokens(tokens: Record<string, string>): Record<string, string> {
  const next = buildDefaultTokens()
  for (const def of THEME_TOKEN_DEFS) {
    const candidate = tokens[def.key]
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      next[def.key] = candidate.trim()
    }
  }
  return next
}

export function readThemeTokensFromDocument(): Record<string, string> {
  const computed = getComputedStyle(document.documentElement)
  const tokens = buildDefaultTokens()
  for (const def of THEME_TOKEN_DEFS) {
    const value = computed.getPropertyValue(def.key).trim()
    if (value.length > 0) {
      tokens[def.key] = value
    }
  }
  return tokens
}

interface ThemeCreatorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTokens: Record<string, string>
  editingTheme?: ThemeRow | null
  onSaved: () => Promise<void> | void
}

export function ThemeCreatorDialog({
  open,
  onOpenChange,
  initialTokens,
  editingTheme,
  onSaved
}: ThemeCreatorDialogProps): React.ReactElement {
  const [name, setName] = useState('')
  const [tokens, setTokens] = useState<Record<string, string>>(buildDefaultTokens)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewClass = useId().replace(/:/g, '-')

  useEffect(() => {
    if (!open) {
      return
    }
    if (editingTheme) {
      setName(editingTheme.name)
      setTokens(withRequiredTokens(editingTheme.tokens))
      setError(null)
      return
    }
    setName('')
    setTokens(withRequiredTokens(initialTokens))
    setError(null)
  }, [open, editingTheme, initialTokens])

  const previewCss = useMemo(() => {
    const vars = Object.entries(tokens)
      .map(([key, value]) => `${key}: ${value};`)
      .join(' ')

    return `.${previewClass} { ${vars} }`
  }, [tokens, previewClass])

  const setTokenValue = (key: string, value: string): void => {
    setTokens((prev) => ({
      ...prev,
      [key]: value
    }))
  }

  const validate = (): string | null => {
    if (name.trim().length === 0) {
      return 'Theme name is required.'
    }

    for (const def of THEME_TOKEN_DEFS) {
      if (!parseHsl(tokens[def.key] ?? '')) {
        return `${def.label} must use the format "H S% L%".`
      }
    }

    return null
  }

  const save = async (): Promise<void> => {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (editingTheme) {
        await window.api.invoke(IPC.THEMES_UPDATE, editingTheme.id, name.trim(), tokens)
        toast.success('Theme updated.')
      } else {
        await window.api.invoke(IPC.THEMES_CREATE, name.trim(), tokens)
        toast.success('Theme created.')
      }
      await onSaved()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save theme.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editingTheme ? 'Edit Theme' : 'Create Theme'}</DialogTitle>
          <DialogDescription>
            Define HSL token values for your custom theme. Values must use the format "H S% L%".
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="theme-name" className="text-xs font-medium text-muted-foreground">
                Theme name
              </label>
              <Input
                id="theme-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nord Twilight"
                disabled={saving}
              />
            </div>

            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {THEME_TOKEN_DEFS.map((def) => {
                const tokenValue = tokens[def.key] ?? ''
                return (
                  <div key={def.key} className="grid grid-cols-[1fr_72px_1fr] items-center gap-2 rounded-md border p-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{def.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{def.key}</p>
                    </div>
                    <Input
                      type="color"
                      value={toColorInputValue(tokenValue)}
                      onChange={(event) => {
                        setTokenValue(def.key, hexToHsl(event.target.value))
                      }}
                      aria-label={`${def.label} color`}
                      disabled={saving}
                      className="h-8 w-[72px] p-1"
                    />
                    <Input
                      value={tokenValue}
                      onChange={(event) => setTokenValue(def.key, event.target.value)}
                      aria-label={`${def.label} HSL value`}
                      disabled={saving}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          <div className="space-y-3">
            <style>{previewCss}</style>
            <div className={`space-y-3 rounded-md border p-4 ${previewClass}`}>
              <p className="text-xs font-medium text-muted-foreground">Preview</p>
              <div className="rounded-md border bg-card p-3 text-card-foreground">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Card</span>
                  <Button size="sm">Primary</Button>
                </div>
                <div className="rounded-md border bg-muted p-2 text-sm text-muted-foreground">
                  Muted area
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Pencil className="h-4 w-4 text-foreground" />
                  <span>Foreground sample</span>
                </div>
              </div>
            </div>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : editingTheme ? 'Save Changes' : 'Create Theme'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
