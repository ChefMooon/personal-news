import { app, shell, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, type NativeImage } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc-types'
import { openDatabase } from './db/database'
import { registerIpcHandlers } from './ipc/index'
import { registerModule, initializeAll, shutdownAll } from './sources/registry'
import { YouTubeModule } from './sources/youtube/index'
import { RedditModule } from './sources/reddit/index'
import { ScriptManagerModule } from './sources/scripts/index'
import { attachWindowListeners } from './notifications/notification-service'
import { getSetting, setSetting } from './settings/store'

let tray: Tray | null = null
let mainWindowRef: BrowserWindow | null = null
let quitting = false
let trayHintHideTimer: ReturnType<typeof setTimeout> | null = null

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

function setupWindowLifecycle(mainWindow: BrowserWindow): void {
  mainWindowRef = mainWindow

  mainWindow.on('show', () => {
    createTray()
  })

  mainWindow.on('hide', () => {
    updateTrayMenu()
  })

  mainWindow.on('minimize' as any, () => {
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
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
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

  return mainWindow
}

app.whenReady().then(() => {
  try {
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
    })

    // 1. Open database and run migrations
    const db = openDatabase()
    console.log('[Main] Database opened')

    ensureBooleanSetting('app_close_to_tray', true)
    ensureBooleanSetting('app_start_minimized', false)
    ensureBooleanSetting('app_minimize_to_tray', false)
    ensureBooleanSetting('app_launch_at_login', false)

    app.setLoginItemSettings({
      openAtLogin: getBooleanSetting('app_launch_at_login', false)
    })

    // 2. Register source modules
    registerModule(YouTubeModule)
    registerModule(RedditModule)
    registerModule(ScriptManagerModule)

    // 3. Initialize all modules
    initializeAll(db)

    // 4. Register IPC handlers
    registerIpcHandlers()
    console.log('[Main] IPC handlers registered')

    // 5. Create window
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
    app.quit()
  }
})

app.on('window-all-closed', () => {
  shutdownAll()
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
