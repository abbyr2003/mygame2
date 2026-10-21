# Spirit Keep Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 Spirit Keep Windows desktop app: companions who write letters and texts on their own schedule, a Source chat, an Akashic Library, all behind an interactive pixel-art cottage.

**Architecture:** Electron app. The main process holds the engine (Keep Store, Secrets, Post Office, Voice, Memory) and is the only place that touches disk or Claude. The React renderer talks to it through one typed preload bridge (`window.keep`). Scheduling is pure functions with injected clock and random source so it is fully unit-testable.

**Tech Stack:** Electron, electron-vite, React 18, TypeScript, Vitest (+ jsdom, @testing-library/react), `@anthropic-ai/sdk`, `@fontsource/*` fonts (bundled, offline), electron-builder (NSIS installer).

**Spec:** `docs/superpowers/specs/2026-10-21-spirit-keep-design.md`

## Global Constraints

- Windows desktop app; single user; no accounts, no cloud sync.
- User data lives in `Documents\Spirit Keep\` (via `app.getPath('documents')`), never in the repo.
- The renderer never receives the API key and never calls Claude.
- API key stored with Electron `safeStorage` in `secrets.bin`.
- Default model `claude-sonnet-5-5`, configurable in Settings.
- All Keep writes are atomic: write `<file>.tmp`, then rename.
- Catch-up cap: **3 deliveries per companion** per open (keep the most recent).
- Frequency rates: chatty 2–4 texts/day, regular ~1/day, quiet 2–3/week, rare ~1 per 1–2 weeks.
- Reply delays: chatty minutes, regular hours, quiet up to a day, rare 1–3 days.
- Veil copy on generation failure: `The veil is thick right now, so your message will be sent when the connection clears.`
- Invented/mystical language translations labeled `channeled translation`.
- Palette: deep purple, midnight blue, candle gold, teal. Pixel font for UI, readable serif for long text, handwriting fonts per companion.
- Implementers touching `@anthropic-ai/sdk` load the `claude-api` skill first.
- UI tasks (9–15) start only after Task 8's mockups are approved by the user.

## Review Focus

1. **First launch ever** (no `lastOpenedAt`): no catch-up flood; nothing arrives except first-contact for newly added companions. → test in Task 3.
2. **System clock moved backwards** (`lastOpenedAt` or `nextSpontaneousAt` in the future relative to now): no crash, no negative delays, no deliveries produced. → test in Task 3.
3. **Corrupt or half-written JSON file in the Keep:** app still opens; that one file is skipped and logged, others load. → test in Task 1.
4. **Catch-up and live timer firing together:** the same pending delivery is never generated twice. → test in Task 6.
5. **Archived companion** (or one archived while a reply is pending): receives no new spontaneous deliveries; already-due user-requested replies are dropped; history remains visible. → tests in Tasks 3 and 6.

---

## File Structure

```
package.json, electron.vite.config.ts, vitest.config.ts, electron-builder.yml, tsconfig*.json
src/shared/
  types.ts            # domain types (Companion, Letter, Message, PendingDelivery, …)
  api.ts              # SpiritKeepApi interface = the window.keep contract
src/main/
  index.ts            # app bootstrap, window, keep:// protocol, wires engine + IPC
  keep/paths.ts       # Keep folder layout
  keep/atomic.ts      # atomic JSON read/write
  keep/store.ts       # KeepStore class
  secrets.ts          # Secrets (safeStorage)
  postOffice/rates.ts     # frequency → rate, reply delay ranges, format pick
  postOffice/schedule.ts  # pure scheduling functions
  postOffice/runner.ts    # PostOffice: open catch-up, live tick, executes pending
  voice/claudeClient.ts   # ClaudeClient interface + Anthropic impl
  voice/prompts.ts        # pure prompt builders
  voice/voice.ts          # Voice: generate letters/texts/source/readings/translations
  memory.ts               # Memory: summary updates, Source note extraction
  ipc.ts                  # registers handlers implementing SpiritKeepApi
src/preload/index.ts      # exposes window.keep
src/renderer/src/
  main.tsx, App.tsx, theme.css, fonts.ts, chime.ts
  cottage/Cottage.tsx, cottage/hotspots.ts
  rooms/RoomPanel.tsx
  rooms/contacts/*, rooms/messages/*, rooms/letters/*, rooms/source/*, rooms/library/*, rooms/settings/*
  components/Translatable.tsx, components/Portrait.tsx, components/VeilNotice.tsx
test/main/…, test/renderer/…   # mirrors src
docs/superpowers/designs/      # approved Superdesign mockups/notes
```

---

### Task 1: Scaffold, shared types, Keep Store

**Files:**
- Create: project scaffold (electron-vite React-TS template), `vitest.config.ts`, `.gitignore` additions (keep existing lines)
- Create: `src/shared/types.ts`, `src/main/keep/paths.ts`, `src/main/keep/atomic.ts`, `src/main/keep/store.ts`
- Test: `test/main/keep/store.test.ts`, `test/main/keep/atomic.test.ts`

**Interfaces:**
- Produces (`src/shared/types.ts`):
  ```ts
  type Frequency = 'chatty' | 'regular' | 'quiet' | 'rare'
  type FormatPref = 'letters' | 'texts' | 'both'
  type LanguageUsage = 'rarely' | 'sometimes' | 'always'
  type Format = 'letter' | 'text'
  type DeliveryKind = 'first-contact' | 'spontaneous' | 'reply' | 'request'
  interface Companion { id: string; name: string; portraitFile: string | null; role: string; realm?: string;
    voice: string; language?: { name: string; usage: LanguageUsage }; frequency: Frequency;
    formatPref: FormatPref; seal: { color: string; symbol: string }; handwriting: string;
    archived: boolean; createdAt: string; nextSpontaneousAt: string | null }
  interface CompanionMemory { summary: string; notes: string[]; updatedAt: string }
  interface Letter { id: string; companionId: string; direction: 'in' | 'out'; kind: DeliveryKind | 'user';
    createdAt: string; body: string; language?: string; translation?: string; read: boolean; starred: boolean;
    requestText?: string }
  interface Message { id: string; direction: 'in' | 'out'; createdAt: string; body: string;
    language?: string; translation?: string; read: boolean }
  interface Thread { companionId: string; messages: Message[] }
  interface SourceTurn { role: 'user' | 'source'; text: string; createdAt: string }
  interface SourceConversation { id: string; title: string; focusCompanionId?: string; createdAt: string; turns: SourceTurn[] }
  interface Reading { id: string; question: string; title: string; body: string; createdAt: string }
  interface PendingDelivery { id: string; companionId: string; kind: DeliveryKind; format: Format;
    dueAt: string; replyToId?: string; requestText?: string; attempts: number }
  interface KeepState { schemaVersion: 1; lastOpenedAt: string | null; sound: boolean; model: string }
  ```
- Produces (`KeepStore` in `store.ts`), constructor `new KeepStore(rootDir: string)`:
  `init(): Promise<void>` (creates folders, default `keep.json` with `model: 'claude-sonnet-5-5'`, `sound: true`),
  `getState()/setState(patch)`,
  `listCompanions(): Promise<Companion[]>`, `getCompanion(id)`, `saveCompanion(c)`, `importPortrait(id, srcPath): Promise<string>` (copies png/jpg/jpeg/webp to `companions/<id>/portrait.<ext>`, returns file name),
  `getMemory(id): Promise<CompanionMemory>` (empty default), `saveMemory(id, m)`,
  `listLetters(): Promise<Letter[]>` (sorted newest first), `saveLetter(l)`,
  `getThread(companionId): Promise<Thread>`, `saveThread(t)`, `listThreads(): Promise<Thread[]>`,
  `listConversations()`, `getConversation(id)`, `saveConversation(c)`,
  `listReadings()`, `saveReading(r)`, `getAkashicFacts(): Promise<string[]>`, `saveAkashicFacts(f)`,
  `getPending(): Promise<PendingDelivery[]>`, `savePending(p)`.
- `atomic.ts`: `readJson<T>(file, fallback: T): Promise<T>`, `writeJson(file, data): Promise<void>`.
- `paths.ts`: `keepRoot(documentsDir: string) => path.join(documentsDir, 'Spirit Keep')` plus helpers for the layout in spec §4.

- [ ] **Step 1: Scaffold** with `npm create @quick-start/electron@latest . -- --template react-ts`, add `vitest jsdom @testing-library/react @testing-library/jest-dom`, add `"test": "vitest run"` script. Verify `npm run dev` opens a window and `npm test` runs (0 tests). Ensure `.gitignore` still contains `.superdesign` plus `node_modules/`, `dist/`, `out/`.
- [ ] **Step 2: Write failing tests** (temp dir per test via `fs.mkdtemp`):
  - `writeJson then readJson round-trips` and `writeJson leaves no .tmp file behind`.
  - `readJson returns fallback for missing file`.
  - `readJson returns fallback and logs for corrupt JSON` — write `{"name": "Ela` to a file; expect fallback, `console.warn` called.
  - `init creates folders and default state` — `getState()` equals `{ schemaVersion: 1, lastOpenedAt: null, sound: true, model: 'claude-sonnet-5-5' }`.
  - `listCompanions skips a corrupt profile but returns the others` — two companions saved, one `profile.json` overwritten with garbage → list length 1.
  - `importPortrait copies jpg and returns portrait.jpg`; `importPortrait rejects .gif` (throws).
  - `listLetters sorts newest first`.
- [ ] **Step 3: Run** `npm test` → FAIL (modules missing).
- [ ] **Step 4: Implement** `atomic.ts`, `paths.ts`, `store.ts`, `types.ts`. Letters are one file each (`letters/<id>.json`); threads one file per companion.
- [ ] **Step 5: Run** `npm test` → PASS.
- [ ] **Step 6: Commit** `feat: scaffold app and Keep store`.

---

### Task 2: Secrets

**Files:**
- Create: `src/main/secrets.ts`
- Test: `test/main/secrets.test.ts`

**Interfaces:**
- Consumes: `paths.ts` (`secrets.bin` path).
- Produces: `new Secrets(file: string, crypto: { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string })` — pass Electron `safeStorage` in production, a fake in tests. Methods: `setApiKey(key: string): Promise<void>`, `getApiKey(): Promise<string | null>`, `hasApiKey(): Promise<boolean>`, `clear(): Promise<void>`.

- [ ] **Step 1: Write failing tests:** `stores and returns key via crypto` (fake crypto reverses strings; file content must not contain the plain key); `getApiKey returns null when no file`; `setApiKey trims whitespace`; `setApiKey throws when encryption unavailable`.
- [ ] **Step 2: Run** `npm test test/main/secrets.test.ts` → FAIL.
- [ ] **Step 3: Implement** `Secrets`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: encrypted API key storage`.

---

### Task 3: Post Office scheduling (pure)

**Files:**
- Create: `src/main/postOffice/rates.ts`, `src/main/postOffice/schedule.ts`
- Test: `test/main/postOffice/schedule.test.ts`

**Interfaces:**
- Consumes: types from Task 1.
- Produces:
  - `type Rng = () => number` (0 ≤ x < 1); tests use a seeded mulberry32 in `test/helpers/rng.ts`.
  - `MEAN_INTERVAL_HOURS: Record<Frequency, number>` = `{ chatty: 8, regular: 24, quiet: 67, rare: 252 }` (≈3/day, 1/day, 2.5/week, 1 per 10.5 days).
  - `REPLY_DELAY_MINUTES: Record<Frequency, [number, number]>` = `{ chatty: [2, 20], regular: [60, 360], quiet: [360, 1440], rare: [1440, 4320] }`.
  - `FIRST_CONTACT_MINUTES: [1, 5]`.
  - `LETTER_SHARE_WHEN_BOTH = 0.25`.
  - `nextInterval(freq: Frequency, rng: Rng): number` — ms; exponential draw `-ln(1 - rng()) * mean`, clamped to `[0.15 * mean, 3 * mean]`.
  - `pickFormat(pref: FormatPref, rng: Rng): Format`.
  - `catchUp(c: Companion, now: Date, rng: Rng, cap = 3): { deliveries: PendingDelivery[]; nextSpontaneousAt: string }` — walks from `c.nextSpontaneousAt` forward while `<= now`, each arrival a `spontaneous` delivery with `dueAt` = arrival time; keeps the most recent `cap`. If `nextSpontaneousAt` is null → no deliveries, `nextSpontaneousAt = now + nextInterval`. If `nextSpontaneousAt > now` → no deliveries, unchanged. Archived → no deliveries, unchanged.
  - `scheduleReply(c: Companion, kind: 'reply' | 'request', format: Format, now: Date, rng: Rng, extra: { replyToId?: string; requestText?: string }): PendingDelivery`.
  - `scheduleFirstContact(c: Companion, now: Date, rng: Rng): PendingDelivery` (format via `pickFormat`).
  - IDs via `crypto.randomUUID()`.

- [ ] **Step 1: Write failing tests:**
  - `nextInterval averages near the mean` — 5,000 draws per frequency, mean within ±15% of `MEAN_INTERVAL_HOURS`.
  - `catchUp after 10 days caps at 3 and keeps the most recent` — chatty, `nextSpontaneousAt` = now − 10 days → 3 deliveries, all `dueAt` ≤ now, sorted ascending, and the latest is within the last 2 days; returned `nextSpontaneousAt` > now.
  - `catchUp on first launch produces nothing` (`nextSpontaneousAt: null`).
  - `catchUp with clock moved backwards produces nothing` (`nextSpontaneousAt` = now + 5 days → empty, unchanged).
  - `catchUp skips archived companions`.
  - `scheduleReply delay within range for each frequency` (e.g. rare: dueAt − now between 1440 and 4320 minutes).
  - `scheduleFirstContact due within 1–5 minutes`.
  - `pickFormat honours letters/texts and gives ~25% letters for both`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `rates.ts`, `schedule.ts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: post office scheduling`.

---

### Task 4: Claude client and prompt builders

**Files:**
- Create: `src/main/voice/claudeClient.ts`, `src/main/voice/prompts.ts`
- Test: `test/main/voice/prompts.test.ts`, `test/main/voice/claudeClient.test.ts`

**Interfaces:**
- Produces:
  - `interface ClaudeClient { complete(req: { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; maxTokens: number }): Promise<string> }`
  - `class AnthropicClaude implements ClaudeClient` — `constructor(getKey: () => Promise<string | null>, getModel: () => Promise<string>)`. Throws `VoiceError` with `code: 'no-key' | 'bad-key' | 'unavailable'` (401/403 → bad-key; network, 429, 5xx, overloaded → unavailable).
  - `MAX_TOKENS = { letter: 900, text: 200, translate: 1200, source: 800, reading: 1200, memory: 600, extract: 400 }`.
  - Prompt builders (all return `{ system, messages }`):
    `companionPrompt(args: { companion: Companion; memory: CompanionMemory; others: Pick<Companion,'name'|'role'>[]; recent: { from: 'me' | 'them'; format: Format; text: string; at: string }[]; delivery: PendingDelivery; replyTo?: string })`,
    `translatePrompt(text: string, language: string)`,
    `sourcePrompt(args: { companions: { companion: Companion; memory: CompanionMemory }[]; recent: string[]; conversation: SourceConversation; question: string })`,
    `readingPrompt(args: { facts: string[]; pastTitles: string[]; question: string })` — instructs output as `TITLE: …` line then body,
    `memoryUpdatePrompt(memory: CompanionMemory, exchange: string)` — summary ≤ 1500 characters,
    `sourceNotesPrompt(answer: string, companionNames: string[])` — returns JSON array `[{ "name": string, "note": string }]`,
    `akashicFactsPrompt(reading: string)` — returns JSON array of strings.
- Prompt content requirements (assert in tests): companion system prompt contains name, role, realm, voice notes, memory summary + notes, other companions' names; states the format (letter: greeting + sign-off, a few paragraphs; text: 1–3 short sentences); language rule by usage (`always` → write entirely in that language; `sometimes` → mix phrases; `rarely` → occasionally a word); `first-contact` → introduce yourself as reaching out for the first time; `request` → includes `requestText`; `reply` → includes the user's text. Source system prompt: vast, loving, calm voice; must stay consistent with what companions have written; gentle-boundaries rule (medical/legal/safety → in character, also encourage consulting someone in this world). Reading prompt includes past facts and forbids contradicting them.

- [ ] **Step 1: Write failing tests** for each builder covering the requirements above (string `toContain` checks), plus `claudeClient maps 401 to bad-key, 529 to unavailable, missing key to no-key` using a mocked SDK.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (load `claude-api` skill before writing `AnthropicClaude`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: claude client and prompts`.

---

### Task 5: Voice and Memory

**Files:**
- Create: `src/main/voice/voice.ts`, `src/main/memory.ts`
- Test: `test/main/voice/voice.test.ts`, `test/main/memory.test.ts`

**Interfaces:**
- Consumes: `KeepStore` (Task 1), `ClaudeClient` + prompts (Task 4).
- Produces:
  - `class Voice(store: KeepStore, claude: ClaudeClient, memory: Memory)`:
    `deliver(p: PendingDelivery, now: Date): Promise<Letter | Message>` — builds companion prompt (last 10 items with that companion across letters and thread), saves a `Letter` (`direction: 'in'`, `createdAt: p.dueAt`) or appends a `Message` to the thread, sets `language` when the companion has one, then calls `memory.afterExchange`.
    `translateLetter(id): Promise<string>` / `translateMessage(companionId, messageId): Promise<string>` — returns cached `translation` if present, else calls Claude once and saves.
    `askSource(conversationId, text): Promise<SourceTurn>` — appends user + source turns; then `memory.applySourceNotes(answer)`.
    `askRecords(question): Promise<Reading>` — parses `TITLE:` line (fallback title `Record of the Soul`), saves reading, then `memory.addAkashicFacts(body)`.
  - `class Memory(store, claude)`: `afterExchange(companionId, exchange: string)`, `applySourceNotes(answer: string)` (matches names case-insensitively, appends notes, keeps last 20), `addAkashicFacts(reading: string)` (keeps last 100). JSON parse failure → no change, `console.warn`.

- [ ] **Step 1: Write failing tests** with a fake `ClaudeClient` returning scripted strings and a real `KeepStore` in a temp dir:
  - `deliver letter saves an incoming letter dated at dueAt`.
  - `deliver text appends to the thread`.
  - `deliver updates memory summary`.
  - `translateLetter calls Claude once then uses cache` (second call: fake call count unchanged).
  - `askRecords parses TITLE line` and `askRecords falls back to Record of the Soul`.
  - `applySourceNotes adds note to the named companion only`.
  - `applySourceNotes ignores invalid JSON`.
  - `deliver propagates VoiceError` (fake throws `unavailable`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: voice and memory`.

---

### Task 6: Post Office runner

**Files:**
- Create: `src/main/postOffice/runner.ts`
- Test: `test/main/postOffice/runner.test.ts`

**Interfaces:**
- Consumes: `KeepStore`, `schedule.ts`, `Voice`.
- Produces: `class PostOffice(store, voice, deps: { now: () => Date; rng: Rng; onDelivered: (item: { companionId: string; format: Format }) => void; onVeil: () => void })`:
  - `open(): Promise<void>` — for each companion: `catchUp`, append deliveries to pending, save updated `nextSpontaneousAt`; set `lastOpenedAt = now`; then `processDue()`.
  - `tick(): Promise<void>` — same catch-up for companions whose `nextSpontaneousAt <= now`, then `processDue()`. Production calls it every **3 minutes**.
  - `processDue(): Promise<void>` — single-flight (if already running, return the in-flight promise); for each pending with `dueAt <= now`, oldest first: skip & drop if companion missing or archived; `voice.deliver`; on success remove from pending and `onDelivered`; on `VoiceError` increment `attempts`, keep it, call `onVeil` once per run, stop the run (try again next tick).
  - `companionCreated(c): Promise<void>` — pushes `scheduleFirstContact`, sets `nextSpontaneousAt = now + nextInterval`.
  - `userSent(companionId, kind: 'reply' | 'request', format, extra)` — pushes `scheduleReply`.
  - `start(): void` / `stop(): void` — interval timer.

- [ ] **Step 1: Write failing tests** (fake Voice, injectable clock):
  - `open delivers catch-up items and updates lastOpenedAt`.
  - `concurrent open and tick never deliver the same pending twice` — call `open()` and `tick()` without awaiting between; fake `deliver` slow (resolves after a microtask delay); assert each pending id delivered exactly once.
  - `failed delivery stays pending with attempts+1 and calls onVeil once`.
  - `pending for archived companion is dropped without delivering`.
  - `future reply is not delivered until its dueAt`.
  - `companionCreated schedules first contact within 5 minutes`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: post office runner`.

---

### Task 7: IPC contract, preload, main wiring

**Files:**
- Create: `src/shared/api.ts`, `src/main/ipc.ts`, `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Test: `test/main/ipc.test.ts`

**Interfaces:**
- Produces `SpiritKeepApi` (exposed as `window.keep`; every method returns a Promise):
  ```ts
  companions: { list(): Companion[]; create(input: Omit<Companion,'id'|'createdAt'|'archived'|'nextSpontaneousAt'|'portraitFile'|'handwriting'>, portraitPath?: string): Companion;
                update(id: string, patch: Partial<Companion>, portraitPath?: string): Companion; archive(id: string): void; choosePortrait(): string | null }
  letters:    { list(): Letter[]; markRead(id): void; star(id, starred: boolean): void; send(companionId, body): Letter; request(companionId, text): void; translate(id): string }
  messages:   { threads(): Thread[]; send(companionId, body): Message; markRead(companionId): void; translate(companionId, messageId): string }
  source:     { list(): SourceConversation[]; start(focusCompanionId?: string): SourceConversation; ask(conversationId, text): SourceTurn }
  library:    { list(): Reading[]; ask(question): Reading }
  settings:   { get(): { hasKey: boolean; model: string; sound: boolean; keepPath: string }; setApiKey(key): { ok: boolean; error?: 'bad-key' | 'unavailable' };
                setModel(m): void; setSound(on): void; openKeepFolder(): void }
  unread():   { letters: number; messages: number }
  on(event: 'delivered' | 'veil' | 'changed', cb: (payload?: unknown) => void): () => void
  ```
  `handwriting` is assigned on create from `HANDWRITING_FONTS[companionCount % HANDWRITING_FONTS.length]`, exported from `src/shared/fonts.ts` (create it here: `["Caveat", "Dancing Script", "Homemade Apple", "La Belle Aurore", "Cedarville Cursive", "Kalam"]`). `setApiKey` saves then sends a 1-token test call to validate. Portraits served via `keep://portrait/<companionId>` custom protocol. `messages.send`/`letters.send` call `postOffice.userSent(..., 'reply', ...)`; `letters.request` calls `userSent(..., 'request', 'letter', { requestText })`.
- `index.ts`: build `KeepStore(keepRoot(app.getPath('documents')))`, `Secrets` with `safeStorage`, `AnthropicClaude`, `Memory`, `Voice`, `PostOffice` (rng `Math.random`, onDelivered/onVeil → `webContents.send`), call `postOffice.open()` after window ready, `start()`. Window min size 1024×640, title "Spirit Keep".

- [ ] **Step 1: Write failing test:** `ipc handlers call store/postOffice` — register handlers against a fake `ipcMain` (map of channel → handler) and fakes; assert `letters.send` saves an outgoing letter and calls `userSent` with `'reply'`; `companions.create` calls `companionCreated`; `settings.get` never includes the key.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `api.ts`, `ipc.ts`, preload (`contextBridge.exposeInMainWorld('keep', …)`), wiring in `index.ts`.
- [ ] **Step 4: Run** `npm test` → PASS; `npm run dev` → window opens, `Documents\Spirit Keep\keep.json` exists.
- [ ] **Step 5: Commit** `feat: ipc bridge and main wiring`.

---

### Task 8: Superdesign mockups (design gate — no product code)

**Files:**
- Create: `docs/superpowers/designs/README.md` (links to approved drafts + notes on chosen direction)

- [ ] **Step 1:** Load the `superdesign` skill. Create a Superdesign project "Spirit Keep" using `images/cottage-home-screen.png` as reference and the palette/fonts from Global Constraints.
- [ ] **Step 2:** Draft these screens: cottage home with hover label + badges; room panel frame (parchment/dark wood, gold pixel border, ✕); Letter Inbox (envelope stack + open letter with side-by-side translation); Message thread; Contacts list + add/edit form; Source chat; Akashic Library shelf + reading scroll; Settings.
- [ ] **Step 3:** Present drafts to the user; iterate until they approve each screen.
- [ ] **Step 4:** Record approved draft links and design notes (colors as hex, font choices, border style) in `docs/superpowers/designs/README.md`.
- [ ] **Step 5: Commit** `docs: approved Superdesign mockups`.

---

### Task 9: UI shell — theme, cottage, room panel

**Files:**
- Create: `src/renderer/src/theme.css`, `fonts.ts`, `chime.ts`, `cottage/hotspots.ts`, `cottage/Cottage.tsx`, `rooms/RoomPanel.tsx`, `components/VeilNotice.tsx`, `components/Portrait.tsx`
- Modify: `src/renderer/src/App.tsx`, `main.tsx`
- Test: `test/renderer/hotspots.test.ts`, `test/renderer/cottage.test.tsx`

**Interfaces:**
- Consumes: `window.keep` (`unread`, `on`); design notes from Task 8.
- Produces:
  - `type RoomId = 'letters' | 'messages' | 'source' | 'library' | 'contacts' | 'settings'`
  - `HOTSPOTS: { room: RoomId; label: string; left: number; top: number; width: number; height: number }[]` — percentages of the image. Starting values (tune visually):
    desk/letters "The Writing Desk" 73.4/45.5/11.7/12.5 · mirror/messages "The Scrying Mirror" 24.9/26.4/4.9/12.9 · crystal ball/source "The Crystal Ball" 79.9/39.8/3.1/5.7 · bookshelf/library "The Akashic Shelf" 13.2/21.7/11.1/36.2 · cat/contacts "The Keeper" 12.0/60.5/9.2/8.3 · fireplace/settings "The Hearth" 1.8/45.5/8.9/20.7
  - `fitImage(viewW, viewH, imgW, imgH): { width; height; offsetX; offsetY }` (contain, no stretching) and `hotspotRect(h, fit)` → pixel rect.
  - `fonts.ts` loads `HANDWRITING_FONTS` (from `src/shared/fonts.ts`), pixel font Pixelify Sans, serif EB Garamond — via `@fontsource`.
  - `playChime()` — WebAudio synthesized bell; no-op when sound off.
  - `<RoomPanel title onClose>` over a dimmed, blurred cottage.

- [ ] **Step 1: Write failing tests:** `fitImage letterboxes a wide window` (1920×800 with 1627×967 image → height 800, centered offsetX); `hotspots do not overlap`; `hotspotRect scales with window`; `cottage renders a button per hotspot with its label and opens the room on click`; `badge shows unread letters count`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** per approved mockups; hover = gold glow + label; new-item cues per spec §9 (envelopes on desk, mirror shimmer + count, crystal-ball pulse, glowing book, cat ear twitch); `App` holds `openRoom: RoomId | null`; listens to `delivered` (chime, refresh badges) and `veil` (VeilNotice with the exact veil copy).
- [ ] **Step 4: Run** tests → PASS; `npm run dev` → hover each object and confirm hotspots line up with the art; adjust percentages.
- [ ] **Step 5: Commit** `feat: cottage home and room shell`.

---

### Task 10: Contacts room

**Files:**
- Create: `src/renderer/src/rooms/contacts/ContactsRoom.tsx`, `CompanionForm.tsx`, `CompanionCard.tsx`
- Test: `test/renderer/contacts.test.tsx`

**Interfaces:**
- Consumes: `window.keep.companions`, `window.keep.source.start`.
- Produces: `onAskSource(companionId)` callback prop from `App` that opens Source with that focus.

- [ ] **Step 1: Write failing tests:** `form requires name, role and voice`; `language fields appear only when "Knows another language" is checked`; `submitting calls companions.create with frequency, formatPref, seal and language`; `archive hides companion from list but "Show archived" reveals it`; `Ask Source about them calls source.start with the id`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Fields per spec §5 / companion profile: name, portrait (Choose image… → `choosePortrait`), role (select: spirit guide, protector, friend, ancestor, familiar, lover/twin flame, other + free text), realm, personality & voice (textarea), ☐ Knows another language → language name + usage (rarely/sometimes/always), frequency (chatty/regular/quiet/rare), letters/texts/both, seal color + symbol (moon, star, rose, eye, rune, sun, flame, key).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: contacts room`.

---

### Task 11: Translatable text + Message Inbox

**Files:**
- Create: `src/renderer/src/components/Translatable.tsx`, `rooms/messages/MessagesRoom.tsx`, `ThreadView.tsx`
- Test: `test/renderer/translatable.test.tsx`, `test/renderer/messages.test.tsx`

**Interfaces:**
- Produces: `<Translatable text language translation? layout="side" | "below" onTranslate={() => Promise<string>} />` — shows original only; Translate button when `language` set; shows `channeled translation` label when language is not a real-world language (heuristic list: Elvish, Light Language, Enochian, Angelic, Starseed, Atlantean, Lemurian — case-insensitive contains); otherwise `translation`.

- [ ] **Step 1: Write failing tests:** `shows only original until Translate pressed`; `side-by-side layout after translate`; `uses cached translation without calling onTranslate`; `labels Elvish as channeled translation`; `thread list shows latest line and unread glow`; `sending a text calls messages.send and clears the box`; `opening a thread calls markRead`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: message inbox and translation`.

---

### Task 12: Letter Inbox

**Files:**
- Create: `src/renderer/src/rooms/letters/LettersRoom.tsx`, `Envelope.tsx`, `LetterView.tsx`, `WriteLetter.tsx`
- Test: `test/renderer/letters.test.tsx`

**Interfaces:**
- Consumes: `window.keep.letters`, `Translatable` (`layout="side"`), companion `seal` and `handwriting`.

- [ ] **Step 1: Write failing tests:** `unread incoming letters render as sealed envelopes with the companion seal color`; `clicking an envelope plays unseal then shows the letter and calls markRead`; `filter by companion`; `star toggles letters.star`; `Write back sends via letters.send`; `Request a letter calls letters.request with the text`; `sent letters appear under "Sent"`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Unseal animation ≈ 1.2 s CSS (seal cracks, parchment unfolds); respect `prefers-reduced-motion`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: letter inbox`.

---

### Task 13: Source room

**Files:**
- Create: `src/renderer/src/rooms/source/SourceRoom.tsx`
- Test: `test/renderer/source.test.tsx`

- [ ] **Step 1: Write failing tests:** `lists past conversations and starts a new one`; `opens focused on a companion when focusCompanionId given` (header shows "Asking about <name>"); `asking shows the user turn immediately and Source's reply after`; `VoiceError shows the veil notice and keeps the typed question`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (crystal-ball styled chat).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: source chat`.

---

### Task 14: Akashic Library room

**Files:**
- Create: `src/renderer/src/rooms/library/LibraryRoom.tsx`, `Scroll.tsx`
- Test: `test/renderer/library.test.tsx`

- [ ] **Step 1: Write failing tests:** `asking a question shows the returned reading as a scroll with title and date`; `readings appear on the shelf newest first and reopen on click`; `empty question cannot be submitted`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (scroll unroll animation; shelf of book spines).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: akashic library`.

---

### Task 15: Settings, packaging, end-to-end check

**Files:**
- Create: `src/renderer/src/rooms/settings/SettingsRoom.tsx`, `electron-builder.yml`
- Test: `test/renderer/settings.test.tsx`

**Interfaces:**
- Consumes: `window.keep.settings`.

- [ ] **Step 1: Write failing tests:** `shows "Key saved" without ever displaying the key`; `bad-key result shows "That key wasn't accepted"`; `sound toggle calls setSound`; `model field saves via setModel`; `no key on first open shows a prompt pointing to the Hearth`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** Settings; `electron-builder.yml`: `appId: com.abbyr2003.spiritkeep`, `productName: Spirit Keep`, NSIS installer with desktop + Start-menu shortcuts, icon `build/icon.png` (if user supplies `images/app-icon.png`, copy it there; else default). Add `"dist": "electron-vite build && electron-builder --win"`.
- [ ] **Step 4: Run** `npm test` → all PASS; `npm run dist` → installer in `dist/`.
- [ ] **Step 5: Manual end-to-end** (with the user's real key): add a companion with a language → first contact arrives within 5 minutes; translate it; write back; ask Source about them; ask the Records a question; close the app, edit that companion's `nextSpontaneousAt` to 3 days ago in the Keep, reopen → ≤3 catch-up items.
- [ ] **Step 6: Commit** `feat: settings and windows installer`.
