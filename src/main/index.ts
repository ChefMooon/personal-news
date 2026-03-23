import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { openDatabase } from './db/database'
import { registerIpcHandlers } from './ipc/index'
import { registerModule, initializeAll, shutdownAll } from './sources/registry'
import { YouTubeModule } from './sources/youtube/index'
import { RedditModule } from './sources/reddit/index'
import { ScriptManagerModule } from './sources/scripts/index'
import { attachWindowListeners } from './notifications/notification-service'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../resources/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
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
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.personal-news')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. Open database and run migrations
  const db = openDatabase()
  console.log('[Main] Database opened')

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
  attachWindowListeners(mainWindow)

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow()
      attachWindowListeners(win)
    }
  })
})

app.on('window-all-closed', () => {
  shutdownAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
