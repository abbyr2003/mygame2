import { copyFile, mkdir, readdir } from 'fs/promises'
import { extname, join } from 'path'
import { readJson, writeJson } from './atomic'
import { keepPaths, type KeepPaths } from './paths'
import type {
  Companion,
  CompanionMemory,
  KeepState,
  Letter,
  PendingDelivery,
  Reading,
  SourceConversation,
  Thread
} from '../../shared/types'

const DEFAULT_STATE: KeepState = {
  schemaVersion: 1,
  lastOpenedAt: null,
  sound: true,
  model: 'claude-sonnet-5-5'
}

const PORTRAIT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp']

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => join(dir, f))
  } catch {
    return []
  }
}

// Reads every JSON file in a folder, skipping any that are unreadable.
async function readAll<T>(files: string[]): Promise<T[]> {
  const items: (T | null)[] = await Promise.all(files.map((f) => readJson<T | null>(f, null)))
  return items.filter((x): x is T => x !== null)
}

export class KeepStore {
  readonly paths: KeepPaths

  constructor(readonly root: string) {
    this.paths = keepPaths(root)
  }

  async init(): Promise<void> {
    const p = this.paths
    for (const dir of [p.companions, p.letters, p.messages, p.source, p.library]) {
      await mkdir(dir, { recursive: true })
    }
    const state = await readJson<KeepState | null>(p.state, null)
    if (!state) await writeJson(p.state, DEFAULT_STATE)
  }

  async getState(): Promise<KeepState> {
    return { ...DEFAULT_STATE, ...(await readJson<Partial<KeepState>>(this.paths.state, {})) }
  }

  async setState(patch: Partial<KeepState>): Promise<void> {
    await writeJson(this.paths.state, { ...(await this.getState()), ...patch })
  }

  async listCompanions(): Promise<Companion[]> {
    let ids: string[]
    try {
      ids = await readdir(this.paths.companions)
    } catch {
      return []
    }
    const all = await readAll<Companion>(ids.map((id) => this.paths.profile(id)))
    return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  getCompanion(id: string): Promise<Companion | null> {
    return readJson<Companion | null>(this.paths.profile(id), null)
  }

  saveCompanion(c: Companion): Promise<void> {
    return writeJson(this.paths.profile(c.id), c)
  }

  async importPortrait(id: string, srcPath: string): Promise<string> {
    let ext = extname(srcPath).toLowerCase()
    if (!PORTRAIT_EXTENSIONS.includes(ext)) {
      throw new Error(`Portraits must be PNG, JPG or WEBP (got ${ext || 'no extension'})`)
    }
    if (ext === '.jpeg') ext = '.jpg'
    const name = `portrait${ext}`
    await mkdir(this.paths.companionDir(id), { recursive: true })
    await copyFile(srcPath, join(this.paths.companionDir(id), name))
    return name
  }

  getMemory(id: string): Promise<CompanionMemory> {
    return readJson<CompanionMemory>(this.paths.memory(id), { summary: '', notes: [], updatedAt: '' })
  }

  saveMemory(id: string, m: CompanionMemory): Promise<void> {
    return writeJson(this.paths.memory(id), m)
  }

  async listLetters(): Promise<Letter[]> {
    const all = await readAll<Letter>(await listJsonFiles(this.paths.letters))
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  saveLetter(l: Letter): Promise<void> {
    return writeJson(this.paths.letter(l.id), l)
  }

  getThread(companionId: string): Promise<Thread> {
    return readJson<Thread>(this.paths.thread(companionId), { companionId, messages: [] })
  }

  saveThread(t: Thread): Promise<void> {
    return writeJson(this.paths.thread(t.companionId), t)
  }

  async listThreads(): Promise<Thread[]> {
    return readAll<Thread>(await listJsonFiles(this.paths.messages))
  }

  async listConversations(): Promise<SourceConversation[]> {
    const all = await readAll<SourceConversation>(await listJsonFiles(this.paths.source))
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getConversation(id: string): Promise<SourceConversation | null> {
    return readJson<SourceConversation | null>(this.paths.conversation(id), null)
  }

  saveConversation(c: SourceConversation): Promise<void> {
    return writeJson(this.paths.conversation(c.id), c)
  }

  async listReadings(): Promise<Reading[]> {
    const all = await readAll<Reading>(await listJsonFiles(this.paths.library))
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  saveReading(r: Reading): Promise<void> {
    return writeJson(this.paths.reading(r.id), r)
  }

  getAkashicFacts(): Promise<string[]> {
    return readJson<string[]>(this.paths.akashicMemory, [])
  }

  saveAkashicFacts(facts: string[]): Promise<void> {
    return writeJson(this.paths.akashicMemory, facts)
  }

  getPending(): Promise<PendingDelivery[]> {
    return readJson<PendingDelivery[]>(this.paths.pending, [])
  }

  savePending(p: PendingDelivery[]): Promise<void> {
    return writeJson(this.paths.pending, p)
  }
}
