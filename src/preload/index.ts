import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed IPC bridge to the renderer
contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, listener: (...args: unknown[]) => void): void => {
    ipcRenderer.on(channel, (_event, ...args) => listener(...args))
  },
  off: (channel: string, listener: (...args: unknown[]) => void): void => {
    ipcRenderer.removeListener(channel, listener as Parameters<typeof ipcRenderer.removeListener>[1])
  }
})
