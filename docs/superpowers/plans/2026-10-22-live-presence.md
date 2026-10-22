# Live Presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Companions drift between *here* and *away*, read what the user sends with visible receipts, reply in real time when here and later when away, and a new "devoted" frequency is added.

**Architecture:** A pure, deterministic `src/shared/presence.ts` decides here/away from the companion id and the time. The main-process scheduler and the renderer both use it. The scheduler sets a `readAt` and a `dueAt` for each reply, the IPC layer stores `readAt` on the user's outgoing item, and the post office gets a precise wake-up timer so live replies land in seconds. The renderer shows a status dot, Delivered/Read, typing… and Opened, all derived from `readAt` plus presence.

**Tech Stack:** Electron + React + TypeScript, Vitest (+ Testing Library, jsdom).

**Spec:** `docs/superpowers/specs/2026-10-22-live-presence-design.md`

## Global Constraints

- `HERE_SHARE`: devoted 0.7, chatty 0.5, regular 0.35, quiet 0.2, rare 0.1.
- Visits last 30–90 minutes. `nextHereStart` scans at most 14 days ahead.
- `MEAN_INTERVAL_HOURS` adds `devoted: 3.5`. The other levels are unchanged (chatty 8, regular 24, quiet 67, rare 252).
- Text when here: read 5–30 s after sending, reply 15–60 s after reading. Text when away: read at the next visit start + 0–3 min, reply 1–5 min after reading.
- Letter when here: opened 1–5 min after sending, reply 20–60 min after opening. Letter when away: opened at the next visit start + 0–10 min, reply 60–180 min after opening.
- Spontaneous messages and first contact happen only while the companion is here. Times in away periods move to the next visit start + 0–5 min.
- Batching: a new user text adds no reply if a text reply to that companion is pending with `readAt` still in the future.
- `REPLY_DELAY_MINUTES` is removed.
- Missing `readAt` means no receipt is shown; no migration is needed.
- UI copy: "here", "away", "Delivered", "Read <time>", "typing…", "Opened <time>". The devoted hint is "many times a day".
- Run tests with `npx vitest run`. Push `phase1` to GitHub after each task.

## Review Focus

1. **Second text after the companion has already read the first (typing…).** A second reply is scheduled. When it's delivered it must answer only what's still unanswered, falling back to the `replyToId` text. It must not resend the first message. (Test in Task 4.)
2. **Pending deliveries saved before this update (no `readAt`).** They must still be delivered at their `dueAt`, and the wake timer must ignore the missing `readAt`. (Test in Task 3.)
3. **Sending to an archived companion.** `userSent` returns `undefined` and the message is saved without `readAt`, so it shows no receipt and no crash. (Test in Task 3.)
4. **The app quits while a wake timer is set.** `stop()` must clear it so no tick runs afterwards. (Test in Task 3.)
5. **Receipts after restart.** `readAt` is stored on the saved message or letter, so the *Read* or *Opened* label is still there after reopening. (Covered by the Task 3 IPC test, which reads it back from the store.)

---

### Task 1: Presence module and the devoted level type

**Files:**
- Create: `src/shared/presence.ts`
- Modify: `src/shared/types.ts:1` (Frequency), `:44-52` (Message), `:30-42` (Letter), `:81-90` (PendingDelivery)
- Test: `test/shared/presence.test.ts`

**Interfaces:**
- Produces:
  - `type Frequency = 'devoted' | 'chatty' | 'regular' | 'quiet' | 'rare'`
  - `Message.readAt?: string`, `Letter.readAt?: string`, `PendingDelivery.readAt?: string`
  - `HERE_SHARE: Record<Frequency, number>`
  - `type PresenceCompanion = Pick<Companion, 'id' | 'frequency'>`
  - `visitsOn(c: PresenceCompanion, day: number): { start: number; end: number }[]`, where `day = Math.floor(ms / DAY)` (UTC) and times are epoch ms
  - `isHere(c: PresenceCompanion, at: Date): boolean`
  - `nextHereStart(c: PresenceCompanion, from: Date): Date`, which returns `from` itself if already here, or `from + 14 days` if nothing is found

- [ ] **Step 1: Write the failing tests** in `test/shared/presence.test.ts`:
  - `is deterministic`: `visitsOn(c, 20000)` deep-equals a second call.
  - `here share matches the frequency`: for each frequency, sum the visit minutes over days 20000–20029, divide by 30×1440, and check it's within 0.08 of `HERE_SHARE[f]`.
  - `visits last 30–90 minutes`: every visit not clipped at the day end has `(end - start)` between 30 and 90 minutes.
  - `different companions differ`: `visitsOn({id:'a',…}, d)` is not equal to `visitsOn({id:'b',…}, d)`.
  - `isHere agrees with visits`: for the first visit `v`, `isHere(c, new Date(v.start))` is true, and `isHere(c, new Date(v.start - 1))` is false when `v.start` isn't the day start.
  - `nextHereStart`: it returns `from` when here. When away, it returns a time where `isHere` is true, it's later than `from`, and `isHere` was false one minute before it.
  - `rates include devoted`: `HERE_SHARE` equals `{ devoted: 0.7, chatty: 0.5, regular: 0.35, quiet: 0.2, rare: 0.1 }`.

- [ ] **Step 2: Run** `npx vitest run test/shared/presence.test.ts`. Expected: FAIL (the module doesn't exist).

- [ ] **Step 3: Implement.** Add the type changes in `types.ts`. In `presence.ts`, use no Node imports, because the renderer imports it. Use a local FNV-1a string hash and mulberry32 (same algorithm as `test/helpers/rng.ts`). The generator:

```ts
// One generator per (companion, UTC day): gaps and 30–90 min visits alternate.
// Gap mean is chosen so visit / (visit + gap) ≈ HERE_SHARE.
const rng = mulberry32(fnv1a(`${c.id}:${day}`))
const gapMean = 60 * (1 - share) / share            // minutes
let t = dayStart + rng() * gapMean * MIN
while (t < dayEnd) {
  const end = Math.min(t + (30 + 60 * rng()) * MIN, dayEnd)
  visits.push({ start: t, end })
  t = end + gapMean * (0.5 + rng()) * MIN
}
```

  `nextHereStart` walks forward day by day (from `from`'s day) and returns the first visit with `end > from`, starting at `max(start, from)`. It's capped at 14 days.

- [ ] **Step 4: Run** `npx vitest run test/shared/presence.test.ts`, then `npx tsc --noEmit -p tsconfig.node.json` and `npx tsc --noEmit -p tsconfig.web.json`. Expected: tests PASS. Type errors are expected only in `rates.ts` (missing `devoted`), which is fixed in Task 2. If the tsconfig names differ, use the ones in the repo root.

- [ ] **Step 5: Commit and push**

```bash
git add src/shared/presence.ts src/shared/types.ts test/shared/presence.test.ts
git commit -m "feat: companion presence"
git push origin phase1
```

---

### Task 2: Presence-aware scheduling

**Files:**
- Modify: `src/main/postOffice/rates.ts`, `src/main/postOffice/schedule.ts`
- Test: `test/main/postOffice/schedule.test.ts` (replace the `REPLY_DELAY_MINUTES` tests)

**Interfaces:**
- Consumes: `isHere`, `nextHereStart` (Task 1)
- Produces:
  - `rates.ts`:
    - `MEAN_INTERVAL_HOURS` (+ `devoted: 3.5`)
    - `READ_DELAY_SECONDS: Record<Format, { here: [number, number]; away: [number, number] }>` = `{ text: { here: [5, 30], away: [0, 180] }, letter: { here: [60, 300], away: [0, 600] } }`
    - `REPLY_AFTER_READ_SECONDS` (same shape) = `{ text: { here: [15, 60], away: [60, 300] }, letter: { here: [1200, 3600], away: [3600, 10800] } }`
    - `VISIT_JITTER_MINUTES: [number, number] = [0, 5]`
    - `REPLY_DELAY_MINUTES` is deleted.
  - `schedule.ts`:
    - `intoVisit(c: Companion, at: Date, rng: Rng): Date`, which returns `at` if here, else `nextHereStart + VISIT_JITTER`
    - `scheduleReply(c, kind, format, now, rng, extra): PendingDelivery`, now with `readAt` set. Its `dueAt = readAt + REPLY_AFTER_READ`.
    - `catchUp` and `scheduleFirstContact` keep their signatures, with each due time passed through `intoVisit`.

- [ ] **Step 1: Write the failing tests:**
  - The `rates` test expects `MEAN_INTERVAL_HOURS` = `{ devoted: 3.5, chatty: 8, regular: 24, quiet: 67, rare: 252 }`, plus the two new tables and `VISIT_JITTER_MINUTES` exactly as above.
  - `text reply when here`: pick `now = nextHereStart(c, base)` and make sure at least 2 minutes of the visit are left. Expect `readAt - now` in [5 s, 30 s] and `dueAt - readAt` in [15 s, 60 s].
  - `text reply when away`: pick a `now` where `isHere` is false and let `n = nextHereStart(c, now)`. Expect `readAt - n` in [0, 3 min] and `dueAt - readAt` in [1, 5 min].
  - `letter reply here/away`: same approach with the letter windows.
  - `catchUp places spontaneous messages in visits`: for a chatty companion overdue by 2 days, every returned delivery has `isHere(c, dueAt) === true`.
  - `first contact lands in a visit`: `isHere(c, new Date(d.dueAt))` is true and `dueAt >= now + 1 min`.

- [ ] **Step 2: Run** `npx vitest run test/main/postOffice/schedule.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the rates and schedule changes per the Interfaces. `scheduleFirstContact` draws `now + FIRST_CONTACT_MINUTES`, then passes the result through `intoVisit`. In `catchUp`, the loop still advances the unshifted `t`; only each pushed delivery's `dueAt` is shifted.

- [ ] **Step 4: Run** `npx vitest run test/main`. Expected: PASS. If runner tests that relied on the old timings (for example, catch-up counts) fail, update their expectations to match the new rules, not the code.

- [ ] **Step 5: Commit and push** (`feat: presence-aware scheduling`).

---

### Task 3: Read times, batching and the live wake-up timer

**Files:**
- Modify: `src/main/postOffice/runner.ts`, `src/main/ipc.ts:95-145`, `src/main/index.ts:72-80`
- Test: `test/main/postOffice/runner.test.ts`, `test/main/ipc.test.ts`

**Interfaces:**
- Consumes: `scheduleReply` (with `readAt`), from Task 2
- Produces:
  - `PostOfficeDeps.onChanged: () => void`
  - `PostOffice.userSent(...)`: `Promise<string | undefined>`, which returns the `readAt` for the user's item (`undefined` if the companion is missing or archived)
  - In `IpcDeps`, `postOffice.userSent` gets this new return type.

- [ ] **Step 1: Write the failing tests:**
  - runner `userSent returns readAt and stores pending readAt`: the returned string equals `getPending()[0].readAt`.
  - runner `batches texts while unread`: two `userSent(c1,'reply','text')` calls in a row leave one pending item and return the same `readAt`.
  - runner `does not batch once read`: after the first call, `setNow` to just past its `readAt`. The second call adds a second pending item.
  - runner `does not batch letters`: two letter sends leave two pending items.
  - runner `archived companion → undefined` (Review Focus 3).
  - runner `wake timer delivers before the 3-minute tick`: use `vi.useFakeTimers()`, start `po`, and `userSent` while here. Advance `setNow` and the fake timers to `dueAt + 1 s`. Expect `delivered` to contain the item and `onChanged` to have been called.
  - runner `old pending without readAt still delivered` (Review Focus 2).
  - runner `stop clears the wake timer` (Review Focus 4): after `stop()`, advancing fake timers 10 min triggers no delivery.
  - ipc `messages.send stores readAt from userSent`: the fake `userSent` returns `'2026-10-21T12:00:20.000Z'`, and the message in `store.getThread` has that `readAt`. Do the same for `letters.send`. When `userSent` returns `undefined`, the saved item has no `readAt` key.

- [ ] **Step 2: Run** `npx vitest run test/main/postOffice/runner.test.ts test/main/ipc.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `userSent`: inside `exclusive`, look for a pending item with the same `companionId`, `format === 'text'`, `kind === 'reply'` and a future `readAt`. If there is one, return its `readAt`. Otherwise schedule as before and return the new item's `readAt`.
  - Wake timer: add a `private wake: ReturnType<typeof setTimeout> | null` and a private `arm()` that runs only while `this.timer` is set. It finds the earliest future time among all pending `dueAt` and `readAt` values, then sets `setTimeout(delay = min(t - now, TICK_MS) + 250)`. The timeout callback calls `this.tick()`, then `onChanged()`.
  - Call `arm()` at the end of `tick()`, `open()`, `userSent()`, `companionCreated()` and in `start()`. `stop()` clears `wake`.
  - ipc: in `messages.send`, `letters.send` and `letters.request`, call `userSent` first, then save the item with `...(readAt ? { readAt } : {})`.
  - index.ts: pass `onChanged: () => emit('changed')`, and add it to the runner test `setup()`.

- [ ] **Step 4: Run** `npx vitest run test/main`. Expected: PASS.

- [ ] **Step 5: Commit and push** (`feat: read receipts and live replies`).

---

### Task 4: One reply to several texts

**Files:**
- Modify: `src/main/voice/voice.ts:76-103`
- Test: `test/main/voice/voice.test.ts`

**Interfaces:**
- Consumes: the existing `Voice.deliver`
- Produces: no signature change.

- [ ] **Step 1: Write the failing tests:**
  - `reply answers every unanswered text`: the thread is `in "hi"`, `out "one"`, `out "two"`, with pending text reply `replyToId` = the "two" id. The fake Claude's captured user prompt contains `"""one\ntwo"""`.
  - `falls back to replyToId when nothing is unanswered` (Review Focus 1): the thread is `out "one"`, `in "reply"`, with a pending reply whose `replyToId` is "one". The prompt contains `"""one"""`.

- [ ] **Step 2: Run** `npx vitest run test/main/voice/voice.test.ts`. Expected: the first test FAILS.

- [ ] **Step 3: Implement.** For `p.format === 'text' && p.kind === 'reply'`, set `replyTo` to the bodies of the companion's `'me'` text items after their last `'them'` text item, joined with `'\n'`. If that's empty, use the existing `replyToId` lookup.

- [ ] **Step 4: Run** `npx vitest run test/main`. Expected: PASS.

- [ ] **Step 5: Commit and push** (`feat: one reply to several texts`).

---

### Task 5: Devoted option and the status dot

**Files:**
- Create: `src/renderer/src/useNow.ts`, `src/renderer/src/components/PresenceDot.tsx`
- Modify: `src/renderer/src/rooms/contacts/CompanionForm.tsx:16-21`, `CompanionCard.tsx`, `rooms/messages/ThreadView.tsx:43-52`, `src/renderer/src/theme.css`
- Test: `test/renderer/contacts.test.tsx`, `test/renderer/messages.test.tsx`

**Interfaces:**
- Consumes: `isHere` (Task 1)
- Produces:
  - `useNow(intervalMs = 60_000): Date`, which re-renders on that interval
  - `<PresenceDot companion={c} now={now} />`, which renders `<span className="presence-dot here|away" role="status" aria-label="here|away" />`

- [ ] **Step 1: Write the failing tests.** Fake only `Date`, with `vi.useFakeTimers({ toFake: ['Date'], now: … })`, using a time picked with `nextHereStart`, or a time where `isHere` is false.
  - contacts: the form shows a "devoted" option with the text "many times a day" and selecting it saves `frequency: 'devoted'`. A card shows a dot labelled "here" at a here time and "away" at an away time.
  - messages: the thread header shows the dot with the right label.

- [ ] **Step 2: Run** `npx vitest run test/renderer`. Expected: FAIL.

- [ ] **Step 3: Implement.** Make `{ value: 'devoted', hint: 'many times a day' }` the first entry in `FREQUENCIES`. Add the dot to the card (next to the name) and to the thread header `<h2>`. CSS: a 10px round dot, with the existing theme's green token for `.here` and its muted grey for `.away` (reuse the existing variables in `theme.css`).

- [ ] **Step 4: Run** `npx vitest run test/renderer`. Expected: PASS.

- [ ] **Step 5: Commit and push** (`feat: devoted level and presence dot`).

---

### Task 6: Delivered/Read, typing… and Opened

**Files:**
- Modify: `src/renderer/src/rooms/messages/ThreadView.tsx`, `src/renderer/src/rooms/letters/LetterView.tsx`, `src/renderer/src/theme.css`
- Test: `test/renderer/messages.test.tsx`, `test/renderer/letters.test.tsx`

**Interfaces:**
- Consumes: `useNow`, `isHere`, `readAt` on Message and Letter, and the existing `formatWhen`
- Produces: none

- [ ] **Step 1: Write the failing tests** (Date faked as in Task 5):
  - `last outgoing text shows Delivered` when its `readAt` is in the future.
  - `shows Read <formatWhen(readAt)>` when `readAt <= now`.
  - `older messages without readAt show no receipt`.
  - `typing… shows` when the newest message is outgoing, its `readAt <= now`, and the companion is here. `typing… hidden` when the newest message is incoming, or the companion is away.
  - letters: a sent letter with a past `readAt` shows `Opened <time>`. With a future `readAt`, or none, it shows nothing.

- [ ] **Step 2: Run** `npx vitest run test/renderer`. Expected: FAIL.

- [ ] **Step 3: Implement.** In ThreadView, the receipt is a `<p className="receipt">` under the last outgoing bubble only. The typing bubble is a companion-style row with `aria-label={`${c.name} is typing`}` and the text "typing…", placed before the end ref. `now` comes from `useNow()`. Main emits `changed` at `readAt`, so the room reloads and re-renders on time. In LetterView, put `<p className="receipt">Opened {formatWhen(l.readAt)}</p>` under the sent body.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all tests PASS.

- [ ] **Step 5: Manual check.** Run the app (`npm run dev`), message a companion that shows 🟢 and watch Read → typing… → reply arrive within about a minute.

- [ ] **Step 6: Commit and push** (`feat: read receipts, typing and opened`).
