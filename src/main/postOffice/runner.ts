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
  onChanged: () => void
}

export class PostOffice {
  // Serializes every read-modify-write of pending.json and companion schedules.
  private lock: Promise<unknown> = Promise.resolve()
  private running: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  // Fires at the next readAt or dueAt so live replies don't wait for the tick.
  private wake: ReturnType<typeof setTimeout> | null = null

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
    await this.arm()
  }

  async tick(): Promise<void> {
    await this.catchUpAll()
    await this.processDue()
    await this.arm()
  }

  private async arm(): Promise<void> {
    if (!this.timer) return
    const now = this.deps.now().getTime()
    const times = (await this.store.getPending())
      .flatMap((p) => [p.dueAt, p.readAt])
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime())
      .filter((t) => t > now)
    if (this.wake) clearTimeout(this.wake)
    this.wake = null
    if (!this.timer || !times.length) return
    const delay = Math.min(Math.min(...times) - now, TICK_MS) + 250
    this.wake = setTimeout(() => {
      this.wake = null
      this.tick()
        .then(() => this.deps.onChanged())
        .catch((err) => console.warn('Spirit Keep: post office wake failed', err))
    }, delay)
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
    }).then(async (updated) => {
      await this.arm()
      return updated
    })
  }

  async userSent(
    companionId: string,
    kind: 'reply' | 'request',
    format: Format,
    extra: { replyToId?: string; requestText?: string }
  ): Promise<string | undefined> {
    const readAt = await this.exclusive(async () => {
      const c = await this.store.getCompanion(companionId)
      if (!c || c.archived) return undefined
      const now = this.deps.now()
      const pending = await this.store.getPending()
      // Texts sent before the reply goes out share it. If the companion has
      // already read the thread, the new text is read straight away.
      const waiting =
        format === 'text' && kind === 'reply'
          ? pending.find(
              (p) =>
                p.companionId === companionId &&
                p.format === 'text' &&
                p.kind === 'reply' &&
                p.readAt !== undefined &&
                new Date(p.dueAt).getTime() > now.getTime()
            )
          : undefined
      if (waiting) {
        return new Date(Math.max(new Date(waiting.readAt!).getTime(), now.getTime())).toISOString()
      }
      const reply = scheduleReply(c, kind, format, now, this.deps.rng, extra)
      await this.store.savePending([...pending, reply])
      return reply.readAt
    })
    await this.arm()
    return readAt
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.tick().catch((err) => console.warn('Spirit Keep: post office tick failed', err))
    }, TICK_MS)
    void this.arm()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    if (this.wake) clearTimeout(this.wake)
    this.timer = null
    this.wake = null
  }
}
