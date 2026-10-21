import { contextBridge, ipcRenderer } from 'electron'
import {
  API_METHODS,
  EVENT_CHANNEL,
  UNREAD_CHANNEL,
  channelFor,
  type IpcResult,
  type KeepEvent,
  type SpiritKeepApi
} from '../shared/api'

// Errors keep their VoiceError code (e.g. "bad-key") on `.code`.
async function invoke(channel: string, args: unknown[]): Promise<unknown> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<unknown>
  if (result.ok) return result.value
  throw Object.assign(new Error(result.message), { code: result.code })
}

function buildApi(): SpiritKeepApi {
  const api: Record<string, unknown> = {}
  for (const [group, methods] of Object.entries(API_METHODS)) {
    api[group] = Object.fromEntries(
      methods.map((m) => [m, (...args: unknown[]) => invoke(channelFor(group, m), args)])
    )
  }
  api.unread = () => invoke(UNREAD_CHANNEL, [])
  api.on = (event: KeepEvent, cb: (payload?: unknown) => void) => {
    const listener = (_e: unknown, name: KeepEvent, payload?: unknown): void => {
      if (name === event) cb(payload)
    }
    ipcRenderer.on(EVENT_CHANNEL, listener)
    return () => ipcRenderer.removeListener(EVENT_CHANNEL, listener)
  }
  return api as unknown as SpiritKeepApi
}

contextBridge.exposeInMainWorld('keep', buildApi())
