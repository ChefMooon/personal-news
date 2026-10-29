import { contextBridge, ipcRenderer } from "electron";
import {
  IPC,
  normalizeSidebarConfig,
  type SidebarConfig,
  type ThemeInfo,
} from "../shared/ipc-types";
import { MAIN_TO_RENDERER_CHANNELS, RENDERER_TO_MAIN_CHANNELS } from "../main/security/ipc-policy";

function isThemeInfo(value: unknown): value is ThemeInfo {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<ThemeInfo>;
  if (typeof candidate.id !== "string") {
    return false;
  }
  if (candidate.tokens === null || typeof candidate.tokens === "undefined") {
    return true;
  }
  return (
    typeof candidate.tokens === "object" && !Array.isArray(candidate.tokens)
  );
}

function applyInitialSidebarStateSafely(): void {
  let initialSidebarConfig: SidebarConfig = normalizeSidebarConfig(null);

  try {
    initialSidebarConfig = normalizeSidebarConfig(
      ipcRenderer.sendSync(IPC.SETTINGS_GET_SIDEBAR_CONFIG_SYNC),
    );
  } catch {}

  const applyToDom = (): void => {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    root.setAttribute(
      "data-sidebar-collapsed",
      initialSidebarConfig.collapsed ? "true" : "false",
    );
  };

  if (document.documentElement) {
    applyToDom();
  } else {
    window.addEventListener("DOMContentLoaded", applyToDom, { once: true });
  }
}

function applyInitialThemeSafely(): void {
  const fallback: ThemeInfo = { id: "system", tokens: null };
  let initialThemeInfo = fallback;

  try {
    const value = ipcRenderer.sendSync(IPC.SETTINGS_GET_THEME_SYNC);
    if (isThemeInfo(value)) {
      initialThemeInfo = value;
    }
  } catch {}

  const resolvedInitialTheme =
    initialThemeInfo.id === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : initialThemeInfo.id;

  const applyToDom = (): void => {
    const root = document.documentElement;
    if (!root) {
      return;
    }

    root.setAttribute("data-theme", resolvedInitialTheme);

    if (initialThemeInfo.tokens) {
      const existing = document.getElementById("custom-theme-vars");
      if (existing) {
        existing.remove();
      }

      const style = document.createElement("style");
      style.id = "custom-theme-vars";
      const vars = Object.entries(initialThemeInfo.tokens)
        .map(([key, value]) => `${key}: ${value};`)
        .join("\n  ");
      style.textContent = `[data-theme="${resolvedInitialTheme}"] { ${vars} }`;
      document.head.appendChild(style);
    }
  };

  if (document.documentElement) {
    applyToDom();
  } else {
    window.addEventListener("DOMContentLoaded", applyToDom, { once: true });
  }
}

try {
  applyInitialThemeSafely();
} catch {}

try {
  applyInitialSidebarStateSafely();
} catch {}

// Keep the context bridge narrow even if renderer code is compromised. Renderer
// requests and main-process notifications have separate channel allowlists.
// Expose a typed IPC bridge to the renderer.
// on() returns a cleanup function instead of requiring a separate off() call.
// This is necessary because Electron's contextBridge proxies every function argument on each
// crossing — the listener reference received in on() and a later off() call are never the same
// object, so any map-based lookup silently fails and listeners accumulate.
contextBridge.exposeInMainWorld("api", {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!RENDERER_TO_MAIN_CHANNELS.has(channel)) {
      return Promise.reject(new Error("IPC channel is not available to the renderer."));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (
    channel: string,
    listener: (...args: unknown[]) => void,
  ): (() => void) => {
    if (!MAIN_TO_RENDERER_CHANNELS.has(channel)) {
      throw new Error("IPC event channel is not available to the renderer.");
    }
    const wrapper: Parameters<typeof ipcRenderer.on>[1] = (_event, ...args) =>
      listener(...args);
    ipcRenderer.on(channel, wrapper);
    // The closure captures wrapper directly — no cross-context identity lookup needed.
    return () => ipcRenderer.removeListener(channel, wrapper);
  },
});
