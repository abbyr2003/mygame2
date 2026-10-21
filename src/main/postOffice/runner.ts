import type { KeepStore } from '../keep/store'
import type { Voice } from '../voice/voice'
import { VoiceError } from '../voice/claudeClient'
import type { Companion, Format, PendingDelivery } from '../../shared/types'
import {
  catchUp,
  nextInterval,
  scheduleFirstContact,
  scheduleReply,
  type Rng
} from './schedule'

export const TICK_MS = 3 * 60_000
// After this many failed attempts a delivery is given up on.
const MAX_ATTEMPTS = 10

export interface PostOfficeDeps {
  now: () => Date
  rng: Rng
  onDelivered: (item: { companionId: string; format: Format }) => void
  onVeil: () => void
}

export class PostOffice {
  // Serializes every read-modify-write of pending.json and companion schedules.
  private lock: Promise<unknown> = Promise.resolve()
  private running: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly store: KeepStore,
    private readonly voice: Pick<Voice, 'deliver'>,
    private readonly deps: PostOfficeDeps
  ) {}

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.lock.then(fn)
    this.lock = result.catch(() => undefined)
    return result
  }

  private catchUpAll(): Promise<void> {
    return this.exclusive(async () => {
      const now = this.deps.now()
      const added: PendingDelivery[] = []
      for (const c of await this.store.listCompanions()) {
        const { deliveries, nextSpontaneousAt } = catchUp(c, now, this.deps.rng)
        added.push(...deliveries)
        if (nextSpontaneousAt !== c.nextSpontaneousAt) {
          await this.store.saveCompanion({ ...c, nextSpontaneousAt })
        }
      }
      if (added.length) await this.store.savePending([...(await this.store.getPending()), ...added])
    })
  }

  async open(): Promise<void> {
    await this.catchUpAll()
    await this.store.setState({ lastOpenedAt: this.deps.now().toISOString() })
    await this.processDue()
  }

  async tick(): Promise<void> {
    await this.catchUpAll()
    await this.processDue()
  }

  // Only one delivery run at a time; callers during a run share it.
  processDue(): Promise<void> {
    if (!this.running) {
      this.running = this.run().finally(() => {
        this.running = null
      })
    }
    return this.running
  }

  private async run(): Promise<void> {
    for (;;) {
      const next = await this.exclusive(() => this.takeNextDue())
      if (!next) return
      try {
        await this.voice.deliver(next, this.deps.now())
        await this.remove(next.id)
        this.deps.onDelivered({ companionId: next.companionId, format: next.format })
      } catch (err) {
        await this.failed(next, err)
        if (!(err instanceof VoiceError && err.code === 'refused')) {
          this.deps.onVeil()
          return
        }
      }
    }
  }

  // Oldest due delivery, after dropping any whose companion is gone or archived.
  private async takeNextDue(): Promise<PendingDelivery | null> {
    const now = this.deps.now().getTime()
    const pending = await this.store.getPending()
    const live = new Set(
      (await this.store.listCompanions()).filter((c) => !c.archived).map((c) => c.id)
    )
    const kept = pending.filter((p) => live.has(p.companionId))
    if (kept.length !== pending.length) await this.store.savePending(kept)
    const due = kept
      .filter((p) => new Date(p.dueAt).getTime() <= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    return due[0] ?? null
  }

  private remove(id: string): Promise<void> {
    return this.exclusive(async () => {
      await this.store.savePending((await this.store.getPending()).filter((p) => p.id !== id))
    })
  }

  private failed(p: PendingDelivery, err: unknown): Promise<void> {
    return this.exclusive(async () => {
      const refused = err instanceof VoiceError && err.code === 'refused'
      const waitingForKey = err instanceof VoiceError && err.code === 'no-key'
      const pending = (await this.store.getPending())
        .map((x) => (x.id === p.id && !waitingForKey ? { ...x, attempts: x.attempts + 1 } : x))
        .filter((x) => !(x.id === p.id && (refused || x.attempts >= MAX_ATTEMPTS)))
      await this.store.savePending(pending)
    })
  }

  companionCreated(c: Companion): Promise<Companion> {
    return this.exclusive(async () => {
      const now = this.deps.now()
      const updated: Companion = {
        ...c,
        nextSpontaneousAt: new Date(
          now.getTime() + nextInterval(c.frequency, this.deps.rng)
        ).toISOString()
      }
      await this.store.saveCompanion(updated)
      await this.store.savePending([
        ...(await this.store.getPending()),
        scheduleFirstContact(updated, now, this.deps.rng)
      ])
      return updated
    })
  }

  userSent(
    companionId: string,
    kind: 'reply' | 'request',
    format: Format,
    extra: { replyToId?: string; requestText?: string }
  ): Promise<void> {
    return this.exclusive(async () => {
      const c = await this.store.getCompanion(companionId)
      if (!c || c.archived) return
      await this.store.savePending([
        ...(await this.store.getPending()),
        scheduleReply(c, kind, format, this.deps.now(), this.deps.rng, extra)
      ])
    })
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.warn('Spirit Keep: post office tick failed', err))
    }, TICK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
