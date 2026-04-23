import {
  app,
  shell,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  screen,
  type NativeImage,
  type Rectangle
} from 'electron'
import { existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc-types'
import { openDatabase, resolveDatabasePath } from './db/database'
import { registerIpcHandlers } from './ipc/index'
import { registerModule, initializeAll, shutdownAll } from './sources/registry'
import { YouTubeModule } from './sources/youtube/index'
import { RedditModule } from './sources/reddit/index'
import { ScriptManagerModule } from './sources/scripts/index'
import { WeatherModule } from './sources/weather/index'
import { SportsModule } from './sources/sports/index'
import { attachWindowListeners } from './notifications/notification-service'
import { getSetting, setSetting } from './settings/store'
import { initializeAutoUpdates } from './updates/service'

let tray: Tray | null = null
let mainWindowRef: BrowserWindow | null = null
let quitting = false
let trayHintHideTimer: ReturnType<typeof setTimeout> | null = null
let persistWindowBoundsTimer: ReturnType<typeof setTimeout> | null = null

const SMOKE_TEST_FLAG = '--smoke-test'
const SMOKE_TEST_OUTPUT_FLAG = '--smoke-output'

type SmokeReportPayload = {
  ok: boolean
  packaged: boolean
  timestamp: string
  dbPath?: string | null
  schemaVersion?: string | null
  error?: string | null
}

const WINDOW_BOUNDS_SETTING_KEY = 'app_window_bounds'
const RESTORE_WINDOW_BOUNDS_SETTING_KEY = 'app_restore_window_bounds'
const START_MAXIMIZED_SETTING_KEY = 'app_start_maximized'
const DEFAULT_WINDOW_WIDTH = 1280
const DEFAULT_WINDOW_HEIGHT = 800
const MIN_WINDOW_WIDTH = 900
const MIN_WINDOW_HEIGHT = 600

type PersistedWindowBounds = {
  x: number
  y: number
  width: number
  height: number
  isMaximized?: boolean
}

function getDesktopPlatform(): 'darwin' | 'win32' | 'linux' {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return process.platform
  }
  return 'linux'
}

function isSmokeTestRun(): boolean {
  return process.argv.includes(SMOKE_TEST_FLAG)
}

function getArgValue(flag: string): string | null {
  const exactPrefix = `${flag}=`
  for (let i = 0; i < process.argv.length; i += 1) {
    const arg = process.argv[i]
    if (arg === flag) {
      return process.argv[i + 1] ?? null
    }
    if (arg.startsWith(exactPrefix)) {
      return arg.slice(exactPrefix.length)
    }
  }
  return null
}

function writeSmokeReport(payload: SmokeReportPayload): void {
  const outputPath = getArgValue(SMOKE_TEST_OUTPUT_FLAG)
  if (!outputPath) {
    return
  }

  try {
    writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8')
  } catch (error) {
    console.error('[SmokeTest] Failed to write smoke report:', error)
  }
}

function getBooleanSetting(key: string, fallback: boolean): boolean {
  const raw = getSetting(key)
  if (raw === null) {
    return fallback
  }
  return raw === 'true' || raw === '1'
}

function ensureBooleanSetting(key: string, fallback: boolean): void {
  if (getSetting(key) !== null) {
    return
  }
  setSetting(key, fallback ? '1' : '0')
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validatePersistedBounds(raw: string | null): PersistedWindowBounds | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedWindowBounds>
    if (
      !isFiniteNumber(parsed.x) ||
      !isFiniteNumber(parsed.y) ||
      !isFiniteNumber(parsed.width) ||
      !isFiniteNumber(parsed.height)
    ) {
      return null
    }

    const width = Math.max(Math.round(parsed.width), MIN_WINDOW_WIDTH)
    const height = Math.max(Math.round(parsed.height), MIN_WINDOW_HEIGHT)

    return {
      x: Math.round(parsed.x),
      y: Math.round(parsed.y),
      width,
      height,
      isMaximized: parsed.isMaximized === true
    }
  } catch {
    return null
  }
}

function getIntersectionArea(a: Rectangle, b: Rectangle): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return xOverlap * yOverlap
}

function ensureVisibleBounds(bounds: PersistedWindowBounds): PersistedWindowBounds {
  const displays = screen.getAllDisplays()
  const intersectsAnyDisplay = displays.some((display) => getIntersectionArea(bounds, display.workArea) > 0)

  if (intersectsAnyDisplay) {
    return bounds
  }

  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  return {
    x: primaryWorkArea.x + Math.max(0, Math.floor((primaryWorkArea.width - bounds.width) / 2)),
    y: primaryWorkArea.y + Math.max(0, Math.floor((primaryWorkArea.height - bounds.height) / 2)),
    width: Math.min(bounds.width, primaryWorkArea.width),
    height: Math.min(bounds.height, primaryWorkArea.height),
    isMaximized: bounds.isMaximized
  }
}

function getInitialWindowOptions(): {
  width: number
  height: number
  x?: number
  y?: number
  shouldMaximize: boolean
} {
  const restoreWindowBounds = getBooleanSetting(RESTORE_WINDOW_BOUNDS_SETTING_KEY, true)
  const startMaximized = getBooleanSetting(START_MAXIMIZED_SETTING_KEY, false)

  if (!restoreWindowBounds) {
    return {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      shouldMaximize: startMaximized
    }
  }

  const persisted = validatePersistedBounds(getSetting(WINDOW_BOUNDS_SETTING_KEY))
  if (!persisted) {
    return {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      shouldMaximize: startMaximized
    }
  }

  const visibleBounds = ensureVisibleBounds(persisted)
  return {
    width: visibleBounds.width,
    height: visibleBounds.height,
    x: visibleBounds.x,
    y: visibleBounds.y,
    shouldMaximize: visibleBounds.isMaximized === true || startMaximized
  }
}

function persistWindowBounds(mainWindow: BrowserWindow): void {
  if (!getBooleanSetting(RESTORE_WINDOW_BOUNDS_SETTING_KEY, true)) {
    return
  }

  if (mainWindow.isDestroyed() || mainWindow.isMinimized()) {
    return
  }

  const normalBounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  const payload: PersistedWindowBounds = {
    x: Math.round(normalBounds.x),
    y: Math.round(normalBounds.y),
    width: Math.max(Math.round(normalBounds.width), MIN_WINDOW_WIDTH),
    height: Math.max(Math.round(normalBounds.height), MIN_WINDOW_HEIGHT),
    isMaximized: mainWindow.isMaximized()
  }

  setSetting(WINDOW_BOUNDS_SETTING_KEY, JSON.stringify(payload))
}

function queuePersistWindowBounds(mainWindow: BrowserWindow): void {
  if (persistWindowBoundsTimer) {
    clearTimeout(persistWindowBoundsTimer)
  }

  persistWindowBoundsTimer = setTimeout(() => {
    persistWindowBoundsTimer = null
    persistWindowBounds(mainWindow)
  }, 300)
}

function getResourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, ...segments)
  }
  return join(__dirname, '../../', ...segments)
}

function getTrayIconPath(): string {
  const preferredName = nativeTheme.shouldUseDarkColors ? 'tray-light' : 'tray-dark'
  const preferredExtensions = process.platform === 'win32' ? ['png', 'svg'] : ['png', 'svg']

  for (const extension of preferredExtensions) {
    const preferredPath = getResourcePath('resources', 'tray', `${preferredName}.${extension}`)
    if (existsSync(preferredPath)) {
      return preferredPath
    }
  }

  const fallbackExtensions = process.platform === 'win32' ? ['png', 'svg'] : ['png', 'svg']
  for (const extension of fallbackExtensions) {
    const fallbackPath = getResourcePath('resources', 'tray', `tray-dark.${extension}`)
    if (existsSync(fallbackPath)) {
      return fallbackPath
    }
  }

  const preferredPath = getResourcePath('resources', 'tray', 'tray-dark.png')
  if (existsSync(preferredPath)) {
    return preferredPath
  }
  return getResourcePath('resources', 'tray', 'tray-dark.svg')
}

function getWindowIconPath(): string {
  if (process.platform === 'win32') {
    const iconIcoPath = getResourcePath('resources', 'icon.ico')
    if (existsSync(iconIcoPath)) {
      return iconIcoPath
    }
  }

  const iconPngPath = getResourcePath('resources', 'icon.png')
  if (existsSync(iconPngPath)) {
    return iconPngPath
  }

  return getResourcePath('resources', 'icon.svg')
}

function getTrayIcon(): NativeImage {
  return nativeImage.createFromPath(getTrayIconPath()).resize({ width: 16, height: 16 })
}

function updateTrayMenu(): void {
  if (!tray) {
    return
  }

  const visible = Boolean(mainWindowRef?.isVisible())
  const menu = Menu.buildFromTemplate([
    {
      label: visible ? 'Hide Personal News' : 'Show Personal News',
      click: () => {
        if (mainWindowRef?.isVisible()) {
          hideMainWindow()
          return
        }
        showMainWindow()
      }
    },
    { type: 'separator' },
    {
      label: 'Open Settings',
      click: () => {
        showMainWindow()
      }
    },
    {
      label: 'Quit',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(menu)
}

function updateTrayAppearance(): void {
  if (!tray) {
    return
  }
  tray.setImage(getTrayIcon())
  updateTrayMenu()
}

function showMainWindow(): void {
  if (!mainWindowRef) {
    return
  }
  if (mainWindowRef.isMinimized()) {
    mainWindowRef.restore()
  }
  mainWindowRef.show()
  mainWindowRef.focus()
  updateTrayMenu()
}

function hideMainWindow(): void {
  if (!mainWindowRef) {
    return
  }
  mainWindowRef.hide()
  updateTrayMenu()
}

function createTray(): void {
  if (!tray) {
    tray = new Tray(getTrayIcon())
    tray.setToolTip('Personal News')
    tray.on('click', () => {
      if (mainWindowRef?.isVisible()) {
        hideMainWindow()
      } else {
        showMainWindow()
      }
    })
  }

  updateTrayAppearance()
}

function showTrayCloseHint(mainWindow: BrowserWindow): boolean {
  if (getSetting('app_tray_hint_shown') === '1') {
    return false
  }

  setSetting('app_tray_hint_shown', '1')
  mainWindow.webContents.send(IPC.APP_SHOW_TRAY_HINT)

  if (trayHintHideTimer) {
    clearTimeout(trayHintHideTimer)
  }

  trayHintHideTimer = setTimeout(() => {
    trayHintHideTimer = null
    if (!mainWindow.isDestroyed() && !quitting) {
      mainWindow.hide()
      updateTrayMenu()
    }
  }, 1350)

  return true
}

function emitWindowStateChanged(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send(IPC.WINDOW_STATE_CHANGED, {
    platform: getDesktopPlatform(),
    isMaximized: mainWindow.isMaximized(),
    isFullScreen: mainWindow.isFullScreen()
  })
}

function setupWindowLifecycle(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow

  mainWindow.on('show', () => {
    createTray()
    emitWindowStateChanged(mainWindow)
  })

  mainWindow.on('hide', () => {
    queuePersistWindowBounds(mainWindow)
    updateTrayMenu()
  })

  mainWindow.on('minimize' as any, () => {
    emitWindowStateChanged(mainWindow)
    const minimizeToTray = getBooleanSetting('app_minimize_to_tray', false)
    if (!minimizeToTray) {
      return
    }
    mainWindow.hide()
  })

  mainWindow.on('close', (event) => {
    const closeToTray = getBooleanSetting('app_close_to_tray', true)
    if (quitting || !closeToTray) {
      return
    }
    event.preventDefault()
    if (showTrayCloseHint(mainWindow)) {
      return
    }
    mainWindow.hide()
  })

  mainWindow.on('move', () => {
    queuePersistWindowBounds(mainWindow)
  })

  mainWindow.on('resize', () => {
    queuePersistWindowBounds(mainWindow)
  })

  mainWindow.on('maximize', () => {
    queuePersistWindowBounds(mainWindow)
    emitWindowStateChanged(mainWindow)
  })

  mainWindow.on('unmaximize', () => {
    queuePersistWindowBounds(mainWindow)
    emitWindowStateChanged(mainWindow)
  })

  mainWindow.on('enter-full-screen', () => {
    emitWindowStateChanged(mainWindow)
  })

  mainWindow.on('leave-full-screen', () => {
    emitWindowStateChanged(mainWindow)
  })
}

function createWindow(): BrowserWindow {
  const initialWindowOptions = getInitialWindowOptions()
  const mainWindow = new BrowserWindow({
    width: initialWindowOptions.width,
    height: initialWindowOptions.height,
    x: initialWindowOptions.x,
    y: initialWindowOptions.y,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    frame: process.platform === 'darwin',
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    ...(process.platform === 'darwin' ? {} : { icon: getWindowIconPath() }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    const startMinimized = getBooleanSetting('app_start_minimized', false)
    if (startMinimized) {
      mainWindow.hide()
      return
    }
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (initialWindowOptions.shouldMaximize) {
    mainWindow.maximize()
  }

  return mainWindow
}

app.whenReady().then(() => {
  try {
    const smokeTestRun = isSmokeTestRun()
    const lockAcquired = app.requestSingleInstanceLock()
    if (!lockAcquired) {
      app.quit()
      return
    }

    // Set app user model id for windows
    electronApp.setAppUserModelId('com.personal-news')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    app.on('second-instance', () => {
      showMainWindow()
    })

    app.on('before-quit', () => {
      quitting = true
      if (persistWindowBoundsTimer) {
        clearTimeout(persistWindowBoundsTimer)
        persistWindowBoundsTimer = null
      }
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        persistWindowBounds(mainWindowRef)
      }
    })

    const db = openDatabase()

    if (smokeTestRun) {
      const dbPath = resolveDatabasePath()
      const schemaVersionRow = db
        .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
        .get() as { value: string } | undefined
      console.log(
        `[SmokeTest] Database initialized at ${dbPath}; schema version ${schemaVersionRow?.value ?? 'unknown'}`
      )
      writeSmokeReport({
        ok: true,
        packaged: app.isPackaged,
        dbPath,
        schemaVersion: schemaVersionRow?.value ?? null,
        timestamp: new Date().toISOString()
      })
      app.exit(0)
      return
    }

    ensureBooleanSetting('app_close_to_tray', true)
    ensureBooleanSetting('app_start_minimized', false)
    ensureBooleanSetting('app_minimize_to_tray', false)
    ensureBooleanSetting('app_launch_at_login', false)
    ensureBooleanSetting(RESTORE_WINDOW_BOUNDS_SETTING_KEY, true)
    ensureBooleanSetting(START_MAXIMIZED_SETTING_KEY, false)

    app.setLoginItemSettings({
      openAtLogin: getBooleanSetting('app_launch_at_login', false)
    })

    registerModule(YouTubeModule)
    registerModule(RedditModule)
    registerModule(ScriptManagerModule)
    registerModule(WeatherModule)
    registerModule(SportsModule)

    initializeAll(db)

    registerIpcHandlers()
    void initializeAutoUpdates().catch((error: unknown) => {
      console.error('[Updates] Failed to initialize auto-updater:', error)
    })

    const mainWindow = createWindow()
    createTray()
    setupWindowLifecycle(mainWindow)
    attachWindowListeners(mainWindow)
    nativeTheme.on('updated', updateTrayAppearance)

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) {
        const win = createWindow()
        setupWindowLifecycle(win)
        attachWindowListeners(win)
        return
      }
      showMainWindow()
    })
  } catch (error) {
    console.error('[Main] App startup failed:', error)
    if (isSmokeTestRun()) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error)
      writeSmokeReport({
        ok: false,
        packaged: app.isPackaged,
        error: message,
        timestamp: new Date().toISOString(),
        dbPath: process.env.PERSONAL_NEWS_DB_PATH?.trim() || null,
        schemaVersion: null
      })
    }
    app.quit()
  }
})

app.on('window-all-closed', () => {
  shutdownAll()
  if (persistWindowBoundsTimer) {
    clearTimeout(persistWindowBoundsTimer)
    persistWindowBoundsTimer = null
  }
  if (trayHintHideTimer) {
    clearTimeout(trayHintHideTimer)
    trayHintHideTimer = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
