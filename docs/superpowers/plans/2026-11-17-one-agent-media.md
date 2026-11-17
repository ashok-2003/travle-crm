# One WhatsApp agent, voice notes and images: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The one agent hears voice notes and sees photos through two read tools, `transcribe_voice_note(message)` and
`look_at_image(message, question?)`; what they find is kept on the message for the inbox and later turns; a photo
while a booking waits for payment gives the team a task, and the agent keeps chatting.

**Architecture:** The worker's turn reads the stored file through `files.systemFile` and asks the agent's own models
(feature `sales_agent`, Gemini on OpenRouter) once, counted against the month like any call; the answer is saved on the
message in its own transaction and reused after. The chat names each customer photo and voice note `m1, m2…`, with any
saved words beside it, and the tools take those references. Natural is unchanged: it reads none of the new fields.

**Tech Stack:** as the core plan's.

**Spec:** `docs/superpowers/specs/2026-11-17-one-whatsapp-agent-design.md` sections 5.2 (media lines) and 8, with the
prompt's `transcribe_voice_note` and `look_at_image`. Builds on `docs/superpowers/plans/2026-11-17-one-agent-core.md`
and follows `2026-11-17-one-agent-brochures.md` on the files both edit.

## Global Constraints

- Everything in the core plan's Global Constraints, and `builder-rules.md` (per-package checks, never `pnpm check`).
- **Shared files merge in plan order: brochures, media, buttons, summary** (as the brochures plan says).
- Migration `20261218400000_message_ai_text` (after brochures' `20261218300000`). It only adds nullable columns.
- Media reads use feature `sales_agent` (its models are Gemini, multimodal, on OpenRouter): no new feature, so
  `apps/web`'s and `apps/api/src/ai-services.ts`'s model lists stay untouched (`origin/ayush` edits that file).
- Each read: `maxTokens` 2,000, reasoning effort `minimal`, `timeoutMs` 60,000, `user` the organization's id, through
  natural's `countedModel` (the month's limit). The bytes go to the model only; never to a log, a trace or a job.
- A voice note up to 10 MB and an image up to 8 MB are read; larger, or a format the model can't take (AMR), is
  refused before any call with the way on ("ask them to type it" or "ask what it shows").
- Saved words: at most 2,000 characters, one per message, written once (a second writer finds it written and reads it).
- Only a customer's own photo or voice note in this chat can be read.
- An erased customer's saved words go with the rest of their messages' words.

## Review Focus

1. **OpenRouter refuses WhatsApp's OGG/Opus voice notes for the agent's Gemini model.** Nothing here can check it.
   Expected: the tool answers "couldn't be played; ask them to type what they said", the turn goes on, the trace names
   the failure. Test in Task 3; the live check in Task 1 is the owner's to run.
2. **Two turns read one voice note at once** (a burst, a retry). Expected: one saved transcript, both turns answered,
   no second write over the first. Test in Task 3.
3. **A reference to someone else's message** (another chat's id, our own photo, a team member's file). Expected:
   refused, nothing read. Test in Task 3.
4. **A payment screenshot while a booking waits for payment.** Expected: a task for the team, no forced hand-over, the
   agent may look but never says the money arrived (the prompt's rule). Test in Task 5.
5. **An erasure.** Expected: the saved words are cleared with the message's words. Test in Task 2.

## Rulings

- **MD1. Columns on the message, not a table:** `whatsapp_message.ai_text` (≤ 2,000), `ai_text_kind` (`transcript` or
  `description`, CHECK), `ai_text_at`. — One per message, read with it. — None.
- **MD2. What is saved:** a voice note's transcript; a photo's description of what it shows (two sentences at most,
  amounts and names as written). An answer to a `question` goes back to the model only, since it depends on the
  question. A photo read with a question saves its description too (one call returns both, as JSON).
- **MD3. References `m1…mn`** number the customer's audio and image lines the turn reads, oldest first; written
  `[voice note m3]` and `[photo m7] <caption>`, with ` (heard: "…")` or ` (seen: "…")` when saved. Natural's lines
  carry no reference, so its words don't change.
- **MD4. Audio formats:** the port's `AiPart` audio widens to `wav | mp3 | ogg | aac | m4a`, sent as OpenRouter's
  `input_audio.format`; `audio/amr` is refused. WhatsApp voice notes are `audio/ogg` (Opus). — Spec 8; the core's
  comment on Gemini's own endpoint (WAV and MP3 only) is about that endpoint, not OpenRouter. — If OpenRouter refuses
  OGG, voice notes fall back to "ask them to type" until a converter is added (owner's call).
- **MD5. Payment photos (owner, O4):** `beforeTheModel`'s forced `payment_check` hand-over and its no-tools call go for
  the one agent; a likely-payment photo adds code's task "A photo came in while a booking waits for payment: check it
  in Payments." and a notice; the voice note notice goes too (the tool replaces it). Natural keeps its own rule.

## Files and waits

| Task | Owns | Waits on |
| ---- | ---- | -------- |
| 1    | `packages/integrations/src/ai/{ai-model,openrouter,traced-model}.ts` (audio formats) | none |
| 2    | migration; `packages/db/prisma/schema/whatsapp.prisma` (`WhatsappMessage`, after `mediaAttempts`); `packages/domain/src/inbox/{erasure,chat-messages}.ts`; `packages/contracts/src/inbox/chat.ts` (`aiText`); `apps/web/src/inbox/message-body.tsx`; `apps/web/src/i18n/messages/en-IN/inbox.json` (`aiText.*`) | none |
| 3    | `packages/domain/src/ai/one/media.ts` | Tasks 1, 2 |
| 4    | `packages/contracts/src/ai/one-tools.ts`; `natural/types.ts` (`NaturalChatLine` only); `natural/chat-lines.ts`; `natural/context/chat-turns.ts`; `one/{context,tools,live-io,ends}.ts` | Task 3; core T3, T6, T8, T9, T10, T11; brochures T4 |
| 5    | `packages/domain/src/ai/one/before-the-model.ts`; `one/turn.ts`; `one/dry-turn.ts` | Task 4; core T11, T14 |

Buttons' Task 2 waits on Task 2 (the same inbox files); buttons' Tasks 3–5 and summary's Tasks 2–3 wait on Tasks 4–5.

---

### Task 1: Voice notes in the AI port

**Files:**
- Modify: `packages/integrations/src/ai/ai-model.ts`, `openrouter.ts` (only if it narrows the format), `traced-model.ts`
  (the placeholder names any format)
- Test: `packages/integrations/test/ai/openrouter-audio.test.ts`, `packages/integrations/test/ai/media-live.test.ts`

**Interfaces:**
- Produces: `export type AiAudioFormat = "wav" | "mp3" | "ogg" | "aac" | "m4a"` (`AiPart`'s audio `format`);
  `export function audioFormatOf(contentType: string): AiAudioFormat | null` (`audio/ogg` → `ogg`, `audio/mpeg` →
  `mp3`, `audio/aac` → `aac`, `audio/mp4` → `m4a`, `audio/wav` → `wav`, anything else null).

- [ ] **Step 1: Write the failing tests:** `it("sends an OGG voice note as input_audio with its format")`, `it("knows
  WhatsApp's audio types, and none for AMR")`, `it("traces a voice note by its format and size, never its bytes")`;
  `media-live.test.ts` with `describe.skipIf(!process.env.OPENROUTER_API_KEY || !process.env.VOICE_NOTE_FILE)`:
  `it("transcribes a real WhatsApp voice note on the first agent model")` (the owner points `VOICE_NOTE_FILE` at one).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/integrations test -- test/ai/openrouter-audio.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `pnpm --filter @travel-crm/integrations typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(integrations): WhatsApp's voice note formats reach the model`.

### Task 2: What the AI heard or saw, kept on the message and shown in the inbox

**Files:**
- Create: `packages/db/prisma/migrations/20261218400000_message_ai_text/migration.sql`
- Modify: `whatsapp.prisma`, `packages/domain/src/inbox/erasure.ts` (nulls the three columns), `inbox/chat-messages.ts`
  (maps them), `packages/contracts/src/inbox/chat.ts`, `apps/web/src/inbox/message-body.tsx`, `inbox.json`
- Test: `packages/db/test/message-ai-text-columns.test.ts`, `packages/domain/test/inbox/erasure.test.ts`,
  `packages/domain/test/inbox/chat-ai-text.test.ts`, `apps/web/test/inbox/message-list.test.tsx`

**Interfaces:**
- Produces: `chatMessage.aiText: z.object({ kind: z.enum(["transcript", "description"]), text: z.string() }).nullable()`.
  Under a voice note the bubble reads "Heard: <text>", under a photo "Seen: <text>", in caption type, muted, each with
  an `InfoHint` "What does Heard mean?" ("The AI agent's transcript of this voice note. It may be wrong.").

- [ ] **Step 1: Write the failing tests:** `it("refuses an ai_text_kind other than transcript and description, and
  text past 2,000 characters")`; `it("clears what the AI heard or saw when the customer is erased")`; `it("shows a
  message with what the AI heard")`; web `it("shows Heard under a voice note and Seen under a photo")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/db test -- test/message-ai-text-columns.test.ts`,
  `pnpm --filter @travel-crm/domain test -- test/inbox/erasure.test.ts test/inbox/chat-ai-text.test.ts`,
  `pnpm --filter @travel-crm/web test -- test/inbox/message-list.test.tsx`; expect FAIL.
- [ ] **Step 3: Implement** (the migration by hand, the schema to match, `pnpm --filter @travel-crm/db generate`).
- [ ] **Step 4: Run** the same and `pnpm migrations:check`; expect PASS.
- [ ] **Step 5: Commit** `feat(inbox): keep and show what the AI heard in a voice note or saw in a photo`.

### Task 3: Reading a voice note or a photo

**Files:**
- Create: `packages/domain/src/ai/one/media.ts`
- Test: `packages/domain/test/ai/one/media.test.ts` (real database, memory storage and memory model)

**Interfaces:**
- Consumes: Task 1's `audioFormatOf`, Task 2's columns, natural's `countedModel`, `files.systemFile`.
- Produces:

```ts
export interface MediaReadDependencies { db: Database; files: Files; call: LoopIO["call"]; organizationId: string }
export type MediaRead = { ok: true; text: string } | { ok: false; refused: string };   // refused: "refused: …" for the model
export async function transcribeVoiceNote(deps: MediaReadDependencies,
  input: { conversationId: string; messageId: string }): Promise<MediaRead>;
export async function lookAtImage(deps: MediaReadDependencies,
  input: { conversationId: string; messageId: string; question: string | null }): Promise<MediaRead>;
// lookAtImage's model answer is JSON { description, answer } (AiRequest.schema), answer "" without a question;
// the tool's text: `seen: <description>` and `answer: <answer>` when asked.
```

Order in each: the message must be in `conversationId`, `direction: "in"`, kind `audio` (or `image`; a sticker is not
read), else `refused: m<n> isn't their voice note (or photo)`. Saved words come back with no call (a question still
asks). `mediaState` not `stored` → `refused: that file isn't kept (yet); ask them to …`. Too big or no audio format →
refused, no call. A call that fails or is refused → `refused: it couldn't be played (or seen) just now; ask them to
type what they said (or what it shows)`; "limit" → the month's words. A good answer is saved with
`updateMany({ where: { id, aiText: null } })` in its own transaction, then the saved row is read back and returned. The
system prompts: "Write exactly what is said in this WhatsApp voice note to an Indian travel company, in the language
and script spoken (Hindi in Devanagari, Hinglish in Latin letters). Nothing else." and "Describe what this photo a
customer sent an Indian travel company shows, in at most two sentences, copying any amounts, dates and names exactly.
Then answer the question, if there is one."

- [ ] **Step 1: Write the failing tests:** `it("transcribes a voice note once and keeps the words")`, `it("answers from
  the kept words with no call")`, `it("describes a photo, keeps the description and answers the question")`,
  `it("refuses another chat's message, our own photo and a sticker")`, `it("refuses a file not kept yet or too big, and
  AMR audio, with no call")`, `it("answers a model that can't play it with the way on")` (Review Focus 1), `it("keeps
  the first of two transcripts written at once")` (Review Focus 2), `it("counts each read against the month")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/media.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): read a customer's voice note or photo, once`.

### Task 4: References in the chat, and the two tools

**Files:**
- Modify: `packages/contracts/src/ai/one-tools.ts`, `packages/domain/src/ai/natural/types.ts` (`NaturalChatLine`),
  `natural/chat-lines.ts` (reads `ai_text`, `ai_text_kind`; exports its row mapping for the summary plan),
  `natural/context/chat-turns.ts` (`lineWords` writes a line's reference and saved words), `one/context.ts`,
  `one/tools.ts`, `one/live-io.ts`, `one/ends.ts`
- Test: `packages/contracts/test/ai/one-tools.test.ts`, `packages/domain/test/ai/natural/seams-reads.test.ts`,
  `packages/domain/test/ai/one/{context,tools,loop}.test.ts`

**Interfaces:**
- Consumes: Task 3; core T3, T6 (`lineWords`), T8, T9, T10, T11; brochures T4 (`oneToolSchemas`' `brochureLabels`).
- Produces:

```ts
// contracts/ai/one-tools.ts
export type OneMediaToolName = "transcribe_voice_note" | "look_at_image";
export type OneToolName = NaturalToolName | OneMediaToolName;      // OneToolSchema.name widens to it
export const oneReadTools: readonly OneToolName[] = [...naturalReadTools, "transcribe_voice_note", "look_at_image"];
export function oneToolSchemas(input: { tripLabels: readonly string[]; brochureLabels?: readonly string[];
  voiceNotes?: readonly string[]; photos?: readonly string[] }): OneToolSchema[];
// transcribe_voice_note { message: enum(voiceNotes) }, offered with one at least; look_at_image { message: enum(photos),
// question?: string 1–200 }, likewise. Descriptions from the prompt's section 8.
// natural/types.ts: NaturalChatLine gains, natural setting neither ref
aiText?: { kind: "transcript" | "description"; text: string };
ref?: string;
// natural/chat-lines.ts
export const storedLineFields; export function storedLineOf(row: StoredLine, options?: { earlierWhole?: boolean }): NaturalChatLine;
// one/context.ts: OneContext gains
media: ReadonlyMap<string, { messageId: string; kind: "audio" | "image" }>;
// one/tools.ts: OneToolIO gains, the media tools routed to it
media?: (name: OneMediaToolName, args: Record<string, unknown>) => Promise<string>;
```

`buildOneContext` numbers the customer's `audio` and `image` lines read (oldest first, ruling MD3), sets each line's
`ref`, passes the refs to `oneToolSchemas`, and fills `media`. `oneLiveIO` gives `media` from Task 3 with the turn's
counted call. One's ends count the media tools as reads (`oneReadTools`), so words beside them are never the reply.

- [ ] **Step 1: Write the failing tests:** contracts `it("offers transcribe_voice_note and look_at_image only for the
  turn's own references")`; natural `it("writes a reference and the saved words only on a line that has one")`
  (natural's lines unchanged); context `it("names each voice note and photo m1 on, with what was heard or seen")`;
  tools `it("answers a media tool from the media IO, and a reference the turn lacks as refused")`; loop `it("never
  takes words beside a media read as the reply")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/contracts test -- test/ai/one-tools.test.ts` and
  `pnpm --filter @travel-crm/domain test -- test/ai/natural/seams-reads.test.ts test/ai/one`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and `test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent hears voice notes and looks at photos`.

### Task 5: A payment photo gives the team a task, and the agent keeps chatting

**Files:**
- Create: `packages/domain/src/ai/one/before-the-model.ts`
- Modify: `packages/domain/src/ai/one/turn.ts` (the one `beforeTheModel` call and the act's task), `one/dry-turn.ts`
- Test: `packages/domain/test/ai/one/before-the-model.test.ts`, `packages/domain/test/ai/one/turn.test.ts`

**Interfaces:**
- Produces:

```ts
export const PAYMENT_PHOTO_TASK = "A photo came in while a booking waits for payment: check it in Payments.";
export const PAYMENT_PHOTO_NOTICE =
  "A photo came in while their booking waits for payment; the team will check it. You may look at it, but never say the money arrived.";
/** Ruling MD5: tools always; a likely payment adds code's task and the notice; nothing forced. */
export function oneBeforeTheModel(newLines: readonly NaturalChatLine[]): {
  notice: string | null; tools: "all"; forced: StagedAction[]; task: { kind: "question"; text: string } | null };
```

`runOneTurn` uses it in place of natural's `beforeTheModel` and gives the act its task: a reply's act takes it as its
`task`; a fallback's act, which has a task already, takes its text with ` Also: <the payment task>` added.

- [ ] **Step 1: Write the failing tests:** `it("adds the payment task and notice for a likely payment, and nothing
  forced")`, `it("asks nothing of a voice note before the model")`; turn `it("gives the team a payment task and
  answers with tools, handing nothing over")`, `it("adds the payment task to a fallback's")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/before-the-model.test.ts
  test/ai/one/turn.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): a payment photo is the team's task, and the one agent keeps chatting`.
