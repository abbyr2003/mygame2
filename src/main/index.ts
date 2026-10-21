import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { KeepStore } from './keep/store'
import { keepRoot } from './keep/paths'
import { Secrets } from './secrets'
import { AnthropicClaude } from './voice/claudeClient'
import { Memory } from './memory'
import { Voice } from './voice/voice'
import { PostOffice } from './postOffice/runner'
import { registerIpc } from './ipc'
import { EVENT_CHANNEL, type KeepEvent } from '../shared/api'

// Portraits are served as keep://portrait/<companionId>/<file>.
protocol.registerSchemesAsPrivileged([
  { scheme: 'keep', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let mainWindow: BrowserWindow | null = null

function emit(event: KeepEvent, payload?: unknown): void {
  mainWindow?.webContents.send(EVENT_CHANNEL, event, payload)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: 'Spirit Keep',
    backgroundColor: '#140c24',
    show: false,
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.abbyr2003.spiritkeep')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const root = keepRoot(app.getPath('documents'))
  const store = new KeepStore(root)
  await store.init()
  const secrets = new Secrets(store.paths.secrets, safeStorage)
  const claude = new AnthropicClaude(
    () => secrets.getApiKey(),
    async () => (await store.getState()).model
  )
  const memory = new Memory(store, claude)
  const voice = new Voice(store, claude, memory)
  const postOffice = new PostOffice(store, voice, {
    now: () => new Date(),
    rng: Math.random,
    onDelivered: (item) => {
      emit('delivered', item)
      emit('changed')
    },
    onVeil: () => emit('veil')
  })

  protocol.handle('keep', (request) => {
    const [, id, file] = new URL(request.url).pathname.split('/')
    const safe = /^[\w-]+$/.test(id ?? '') && /^portrait\.(png|jpg|webp)$/.test(file ?? '')
    if (!safe) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(join(store.paths.companionDir(id), file)).toString())
  })

  registerIpc(ipcMain, {
    store,
    postOffice,
    voice,
    secrets,
    testKey: async () => {
      await claude.complete({
        system: 'Reply with the single word OK.',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 16
      })
    },
    choosePortrait: async () => {
      const result = await dialog.showOpenDialog({
        title: 'Choose a portrait',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      })
      return result.canceled ? null : (result.filePaths[0] ?? null)
    },
    openKeepFolder: () => void shell.openPath(root),
    keepPath: root,
    now: () => new Date(),
    emit
  })

  mainWindow = createWindow()
  mainWindow.on('closed', () => (mainWindow = null))
  await postOffice.open()
  postOffice.start()
  app.on('before-quit', () => postOffice.stop())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
