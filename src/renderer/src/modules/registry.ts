import type React from 'react'

export interface RendererModule {
  id: string
  displayName: string
  widget: React.ComponentType
}

// Registry of all available dashboard widget modules
// Module id must match the string used in settings.widget_order and IPC channel prefixes
export const moduleRegistry: RendererModule[] = []

// Populated lazily in each module's own file to avoid circular imports
export function registerRendererModule(mod: RendererModule): void {
  moduleRegistry.push(mod)
}

export function getModule(id: string): RendererModule | undefined {
  return moduleRegistry.find((m) => m.id === id)
}
