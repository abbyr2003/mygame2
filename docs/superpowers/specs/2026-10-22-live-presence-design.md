# Live Presence: availability, read receipts, real-time replies

Date: 2026-10-22

## Goal

Companions feel present. They drift between *here* and *away* during the day,
read what the user sends (with visible read receipts), reply in real time when
here, and later when away. A new "devoted" frequency lets chosen companions
reach out more often. Cost stays under the user's control.

## Behaviour

### Availability
- Each companion is either **here** or **away** at any moment, shown as a status
  dot (green = here, grey = away) on their contact card and in the message thread.
- Visits ("here" blocks) last 30–90 minutes. Share of the day spent here by frequency:
  devoted 70%, chatty 50%, regular 35%, quiet 20%, rare 10%.
- Availability is computed locally and deterministically from the companion id and
  the time. Nothing is stored and no Claude calls are made.

### Texts
- **Here:** the user's message shows *Delivered*, then *Read <time>* 5–30 seconds
  later, then *typing…*, and the reply arrives 15–60 seconds after it was read.
- **Away:** the message stays *Delivered*. It is read at the start of the companion's
  next visit, plus 0–3 minutes, and the reply follows 1–5 minutes after that.
- **Batching:** if a text reply to that companion is already pending and not yet
  read, a new user text doesn't schedule a second reply. The pending reply answers
  everything unanswered (the prompt already includes recent correspondence; the
  reply task is told to answer all of the user's unanswered messages).

### Letters
- **Here:** the letter is *Opened* within 1–5 minutes, and the reply arrives 20–60
  minutes after opening.
- **Away:** the letter is opened at the next visit start plus 0–10 minutes, and the
  reply arrives 1–3 hours after opening.
- Letters are never batched; each letter gets its own reply.

### Messages companions start themselves
- New frequency **devoted**, with a mean interval of 3.5 hours (about 7 a day).
- Spontaneous messages and first contact happen only while the companion is here.
  A spontaneous time that falls in an away period moves to the start of the next
  visit (plus 0–5 minutes).
- The existing levels keep their current mean intervals.
- `REPLY_DELAY_MINUTES` is retired; reply timing now comes from the rules above.

## Architecture

### `src/main/postOffice/presence.ts` (new, pure)
- `isHere(companion, at: Date): boolean`
- `nextHereStart(companion, from: Date): Date`, which returns `from` if already here.
- Time is split into fixed 15-minute slots. Each companion has a seeded hash of
  `(companion.id, visit index)` that builds visits of 30–90 minutes with gaps sized
  so the long-run here share matches the frequency. The result must be identical
  across calls and restarts.
- `nextHereStart` scans forward and is capped at 14 days (it returns the cap if no
  visit is found).
- Exposed to the renderer through a `presence(companionId)` IPC call that returns
  `{ here: boolean }`. The renderer polls it every 60 seconds and on `changed` events.

### Scheduling (`schedule.ts`, `rates.ts`, `runner.ts`)
- `rates.ts`: add `devoted: 3.5` to `MEAN_INTERVAL_HOURS`, add `HERE_SHARE`,
  add read/reply delay ranges for here/away × text/letter, and remove
  `REPLY_DELAY_MINUTES`.
- `scheduleReply` returns `{ delivery, readAt }`, using presence to compute both.
- `PostOffice.userSent` stores `readAt` on the user's outgoing Message or Letter
  (through the store) and applies the text-batching rule.
- `catchUp` and `scheduleFirstContact` shift due times into visits.
- Precise timer: after every scheduling change and every run, `PostOffice` sets a
  single `setTimeout` for the earliest pending `dueAt` or `readAt` still in the
  future, capped at `TICK_MS`. When a `readAt` passes, emit `changed` so the UI
  updates the receipt. The 3-minute tick stays as a safety net.

### Data model (`shared/types.ts`)
- `Frequency` adds `'devoted'`.
- `Message` and `Letter` gain an optional `readAt?: string`, used only on outgoing items.
- `PendingDelivery` gains an optional `readAt?: string`, the moment the companion
  reads the message it answers (used for the typing indicator).
- No migration is needed: missing `readAt` shows no receipt.

### UI
- `CompanionForm`: adds a "devoted" option with the hint "many times a day".
- `CompanionCard` and `ThreadView` header show the status dot.
- `ThreadView`: under the user's last outgoing text it shows *Delivered* or
  *Read <time>* (`readAt <= now`). It shows a *typing…* bubble when a pending text
  reply for this companion has `readAt <= now` and the companion is here.
  The renderer gets this through a `typing(companionId)` IPC call returning a boolean.
- Letters view: an outgoing letter shows *Opened <time>* once `readAt <= now`.

## Error handling
- If the Claude call fails, the existing retry and veil behaviour is unchanged. The
  typing indicator persists while the delivery is pending, which matches "still writing".
- Archived or deleted companions: pending items are dropped as today. Receipts on
  already-sent messages stay as stored.

## Cost
- Presence costs nothing. Batching reduces calls during rapid texting.
- Extra spend comes only from choosing "devoted" and from faster replies.
  No other level becomes more frequent.

## Testing
- `presence.test.ts`: determinism, share of time roughly matches `HERE_SHARE` over
  30 simulated days, visit lengths within 30–90 minutes, `nextHereStart` correctness.
- `schedule.test.ts`: here/away read and reply windows for texts and letters, and
  spontaneous and first-contact times landing inside visits.
- `runner.test.ts`: `readAt` stored on outgoing items, text batching, the precise
  timer firing deliveries before the 3-minute tick, and `changed` emitted at `readAt`.
- Renderer tests: status dot, Delivered/Read label, typing bubble, Opened label,
  and the devoted option.

## Out of scope
- User-set availability hours, push notifications while the app is closed, and
  receipts for Source or Akashic conversations.
