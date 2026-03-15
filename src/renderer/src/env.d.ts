/// <reference types="vite/client" />

interface Window {
  api: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, listener: (...args: unknown[]) => void) => void
    off: (channel: string, listener: (...args: unknown[]) => void) => void
  }
}
