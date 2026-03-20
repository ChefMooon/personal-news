import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed IPC bridge to the renderer.
// on() returns a cleanup function instead of requiring a separate off() call.
// This is necessary because Electron's contextBridge proxies every function argument on each
// crossing — the listener reference received in on() and a later off() call are never the same
// object, so any map-based lookup silently fails and listeners accumulate.
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, listener: (...args: unknown[]) => void): (() => void) => {
    const wrapper: Parameters<typeof ipcRenderer.on>[1] = (_event, ...args) => listener(...args)
    ipcRenderer.on(channel, wrapper)
    // The closure captures wrapper directly — no cross-context identity lookup needed.
    return () => ipcRenderer.removeListener(channel, wrapper)
  }
})
