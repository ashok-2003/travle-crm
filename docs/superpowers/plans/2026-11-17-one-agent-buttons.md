# One WhatsApp agent, booking buttons: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offer reaches the customer as a card code writes from the offer record, with "Book these seats" and
"Change something" buttons; a tap on Book holds the seats and sends the payment message and QR with no model call;
Change, or a tap on an old offer, runs a turn that knows it; the inbox and Try it show both.

**Architecture:** The WhatsApp port gains `sendButtons`; a card is an outbound text row with its buttons, sent by the
inbox's own outbox, so it rolls back with the turn like every AI message. The parser reads a tap's id from every field
it may arrive in (MSG91 hasn't documented the inbound shape). The live offer gains an id; the buttons carry
`book:<id>` and `change:<id>`. Before the model, the one turn reads whether the message it answers is a tap.

**Tech Stack:** as the core plan's.

**Spec:** `docs/superpowers/specs/2026-11-17-one-whatsapp-agent-design.md` section 7 (and 14: the fixed line after a
tap-booking, how Try it shows a tap), with the prompt's section 9, and the MSG91 findings in
`.superpowers/sdd/one-agent/msg91-buttons.md`. Builds on `docs/superpowers/plans/2026-11-17-one-agent-core.md` and
follows the brochures and media plans on the files they share.

## Global Constraints

- Everything in the core plan's Global Constraints, and `builder-rules.md` (per-package checks, never `pnpm check`).
- **Shared files merge in plan order: brochures, media, buttons, summary.**
- Migration `20261218500000_whatsapp_buttons` (after media's `20261218400000`). It only adds nullable columns.
- WhatsApp's limits, checked in the adapter before any request (MSG91 answers a bad one with an empty 400): 1 to 3
  buttons, titles at most 20 characters, ids at most 256 and unique, the body at most 1,024 characters, a footer at
  most 60.
- A button id holds ids only: `book:<offerId>` and `change:<offerId>` (UUIDs), never personal data.
- The titles are fixed: "Book these seats" and "Change something".
- A card goes only inside the 24-hour window (the outbox's own check) and only after the model's words, never beside
  the fallback line (`offer_booking` is in `CUSTOMER_FACING`).
- The parser never logs any part of a webhook body. A typed yes always still books (`book` stays).

## Review Focus

1. **A tap arrives without its id** (MSG91 passes only the title, or a desktop tap comes through oddly). Expected: the
   message reads as the words "Book these seats", and the agent's typed-yes path books on the live offer. Tests in
   Tasks 1 and 4.
2. **Book tapped twice**, or after a booking is already held. Expected: one hold; the second tap books nothing and the
   agent says what stands. Test in Task 4.
3. **A tap on an old offer** (a newer offer, a team line after the card, a lapsed offer). Expected: nothing booked, a
   turn with a notice naming what changed and the live offer, if any. Test in Task 4.
4. **The seats or the price changed between the card and the tap.** Expected: nothing held; one turn with the refusal
   and the trip's open dates. Test in Task 4.
5. **A card that breaks WhatsApp's limits** (a very long trip title). Expected: the body cut to fit, never refused by
   MSG91. Tests in Tasks 1 and 3.

## Rulings

- **BT1. A tap stays kind `text`** (its title as the body) **with a new `button_reply_id`**, not a new kind. — The
  `whatsapp_message_kind_value` check, every reader (lite, natural, search, previews, exports) and the agent's typed
  path keep working, and an id that never arrives degrades to words. Spec 7.2's "new kind `button`" is met by the
  column. — A later kind is one migration.
- **BT2. A card is an outbound `text` row with `buttons`** (JSON, `[{ id, title }]`), sent by the outbox through
  `sendButtons`; its body is the card's text. — It joins the turn's transaction, token and rollback like any AI line.
- **BT3. The offer's id** is a new UUID v7 on `LiveOffer` (`id`, optional so stored offers still read), made when one
  stages `offer_booking`, kept in the chat's facts by the act as today.
- **BT4. Card text** (code's, from the offer and its trip sheet; spec 7.1):

  ```text
  *<trip title, cut to 60>*
  <Sat 19 Dec> · <2 adults, 1 child (8)> · <Double room>
  From <the trip's start city>
  Total ₹22,600 · ₹5,600 advance now        (paying in full: "Total ₹22,600, all now")
  ```

- **BT5. A tap books only when** its offer id is the chat's live offer (`liveOfferOf`'s rule), then `book`'s own
  checks (seats, price, nothing ahead) and the act's hold. The fixed line, by the language of the customer's lines
  before the tap: English "Your seats are held. The payment details are below.", Hinglish "Aapki seats hold ho gayi
  hain, payment ki details neeche hain.", Hindi "आपकी सीटें होल्ड हो गई हैं, पेमेंट की डिटेल नीचे है।".
- **BT6. Change, a stale tap or a refused tap** runs the agent with a notice (texts in Task 4). The prompt's step 4
  already tells the model what to do with each.
- **BT7. The live tap check is the owner's:** before agencies use buttons, one real tap on the pilot number, its raw
  body read once by the owner (never logged by code), and the parser's aliases fixed in `parse-msg91-event.ts` alone.

## Files and waits

| Task | Owns | Waits on |
| ---- | ---- | -------- |
| 1    | `packages/integrations/src/whatsapp/{whatsapp-provider,real-whatsapp,memory-whatsapp,parse-msg91-event,parsed-event}.ts`, their fixtures; `apps/web/test/e2e/support/fake-msg91.ts` | none |
| 2    | migration; `whatsapp.prisma` (`WhatsappMessage`, after `templateParams`); `packages/domain/src/inbox/{messages,system-send,sender,chat-messages}.ts`; `contracts/src/inbox/chat.ts`; `apps/web/src/inbox/message-body.tsx`; `inbox.json` (`buttons.*`) | Task 1; media T2 (the same inbox files) |
| 3    | `packages/domain/src/ai/one/card.ts`; `contracts/src/ai/{natural,one-tools}.ts`; `natural/types.ts` (`offer_booking`); `natural/tools/action-tools.ts`; `natural/act-send.ts`; `packages/domain/src/ai/agent-send.ts` | Task 2; core T3, T5, T11; brochures T4; media T4 |
| 4    | `packages/domain/src/ai/one/tap.ts`; `one/turn.ts` (the tap step); `natural/fallback-line.ts` (exports `languageOf`); `natural/tools/booking-checks.ts` (exports `liveOfferOf`) | Task 3; media T5 (`one/turn.ts`) |
| 5    | `contracts/src/ai/{one-try-it,natural-try-it}.ts`; `natural/dry-answer.ts`; `one/dry-turn.ts`; `apps/web/src/ai/{test-natural-turn,test-section,use-ai}.ts(x)`; `ai.json` (`test.card.*`) | Task 4; core T14; media T5 (`one/dry-turn.ts`) |

Summary's Task 3 waits on Task 4 (`one/turn.ts`).

---

### Task 1: Buttons on the WhatsApp port, and a tap's id in the parser

**Files:**
- Modify: `whatsapp-provider.ts`, `real-whatsapp.ts`, `memory-whatsapp.ts`, `parsed-event.ts`, `parse-msg91-event.ts`,
  `packages/integrations/test/whatsapp/fixtures/` (new tap fixtures), `apps/web/test/e2e/support/fake-msg91.ts`
- Test: `packages/integrations/test/whatsapp/{real-whatsapp,memory-whatsapp,parse-msg91-event}.test.ts`

**Interfaces:**
- Produces:

```ts
export interface WhatsAppButton { id: string; title: string }
export interface WhatsAppButtonsToSend { body: string; buttons: readonly WhatsAppButton[]; footer?: string; replyTo?: string }
// WhatsAppProvider:
sendButtons(number: string, to: string, message: WhatsAppButtonsToSend): Promise<WhatsAppSendResult>;
// a message past WhatsApp's limits answers { ok: false, reason: "other", providerCode: "invalid_buttons" } with no request
// ParsedMessage gains:
buttonReplyId: string | null;               // the tapped button's id, from whichever field carries it
replyKind: "button" | "list" | "template" | null;
```

The MSG91 body is `msg91-buttons.md` section 1's (`content_type: "interactive"`, `interactive.type: "button"`, top-level
fields). The parser reads the id from, in order: `interactive` (an object or a JSON string) `button_reply.id` or
`list_reply.id`; `messages` (a JSON string of Meta's array) `[0].interactive…`; `button.payload` (a template's quick
reply, `replyKind: "template"`). `contentType: "interactive"` is a text message whose `text` is the tapped title. The
memory adapter records sends with their buttons; the journeys' fake MSG91 accepts `content_type: "interactive"`.

- [ ] **Step 1: Write the failing tests:** `it("sends reply buttons as MSG91 documents them")`, `it("refuses buttons past
  WhatsApp's limits without a request")` (4 buttons, a 21-character title, duplicate ids, a 1,025-character body),
  `it("records sent buttons in memory")`, and the parser's `it("reads a tap's id from interactive as an object, as a
  string, and from messages")`, `it("reads a list reply and a template's quick reply")`, `it("keeps the tapped title as
  the words, and no id when none came")` (Review Focus 1).
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/integrations test -- test/whatsapp`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same and the package's `typecheck`; expect PASS.
- [ ] **Step 5: Commit** `feat(integrations): WhatsApp reply buttons, and a tap's id read wherever it comes`.

### Task 2: Cards and taps in the inbox

**Files:**
- Create: `packages/db/prisma/migrations/20261218500000_whatsapp_buttons/migration.sql`
- Modify: `whatsapp.prisma` (`buttons Json?`, `buttonReplyId String? @map("button_reply_id")`), `inbox/messages.ts`
  (`messageColumns` keeps `buttonReplyId`), `inbox/system-send.ts` (`queueSystemText` takes `buttons`),
  `inbox/sender.ts` (a row with buttons goes by `sendButtons`), `inbox/chat-messages.ts`, `contracts/inbox/chat.ts`,
  `apps/web/src/inbox/message-body.tsx`, `inbox.json`
- Test: `packages/db/test/whatsapp-buttons-columns.test.ts`, `packages/domain/test/inbox/inbound.test.ts`,
  `packages/domain/test/inbox/buttons-send.test.ts`, `apps/web/test/inbox/message-list.test.tsx`

**Interfaces:**
- Produces: `queueSystemText(tx, { …, buttons?: readonly WhatsAppButton[] }, now)`; `chatMessage.buttons:
  z.array(z.object({ id: z.string(), title: z.string() })).nullable()` and `chatMessage.tapped: z.boolean()` (a
  button reply). Checks: `buttons` is a JSON array of 1–3 objects (CHECK with `jsonb_array_length`), `button_reply_id`
  at most 256 characters. The bubble shows a card's buttons as their titles under the body ("Buttons: Book these
  seats · Change something") and a tap as "Tapped: <its words>".

- [ ] **Step 1: Write the failing tests:** `it("refuses more than three buttons and an id past 256 characters")`;
  `it("keeps a tap's id on the customer's message")`; `it("sends a queued card by sendButtons, and fails it as any
  send")`; web `it("shows a card's buttons and a customer's tap")`.
- [ ] **Step 2: Run** the db, domain and web tests above; expect FAIL.
- [ ] **Step 3: Implement** (the migration by hand, the schema to match, `pnpm --filter @travel-crm/db generate`).
- [ ] **Step 4: Run** the same and `pnpm migrations:check`; expect PASS.
- [ ] **Step 5: Commit** `feat(inbox): send a card with reply buttons, and keep which button a customer tapped`.

### Task 3: The offer card

**Files:**
- Create: `packages/domain/src/ai/one/card.ts`
- Modify: `contracts/src/ai/natural.ts` (`liveOffer.id`), `contracts/src/ai/one-tools.ts` (`offer_booking`'s
  description: "…The app sends the offer card with Book and Change buttons after your words."),
  `natural/types.ts` (`offer_booking` gains `card?: true`), `natural/tools/action-tools.ts` (one's offer: an id, the
  card, the result), `natural/act-send.ts` (the card after the words), `ai/agent-send.ts` (`sendAiText` takes buttons)
- Test: `packages/domain/test/ai/one/card.test.ts`, `packages/domain/test/ai/natural/action-tools.test.ts`,
  `packages/domain/test/ai/natural/act.test.ts`, `packages/domain/test/ai/one/turn.test.ts`

**Interfaces:**
- Produces:

```ts
// one/card.ts
export const BOOK_TITLE = "Book these seats"; export const CHANGE_TITLE = "Change something";
export function offerCardBody(offer: LiveOffer, sheets: readonly TripSheet[], today: CalendarDate): string;  // BT4, ≤ 1,024
export function offerButtons(offerId: string): WhatsAppButton[];   // [{ id: `book:${id}`, … }, { id: `change:${id}`, … }]
export function tapOf(buttonReplyId: string | null): { button: "book" | "change"; offerId: string } | null;
// one's offer_booking result (replaces the core's P5 string):
//   `offered: ${termsWords}; ${money}. The app sends the offer card with these figures and Book and Change buttons after
//    your words: keep your line short and don't retype the figures`
```

`sendTurn` sends, after the model's words and before any brochure, a staged `card` offer as one text with buttons,
token `ai:<turn>:card`. A natural offer (no `card`) sends nothing new.

- [ ] **Step 1: Write the failing tests:** `it("writes the card from the offer: trip, day, party, room, start city,
  total and advance")`, `it("cuts a long title so the body stays within 1,024 characters")`, `it("reads book and change
  taps, and nothing from other ids")`; action tools `it("gives one's offer an id and a card, and tells the model not to
  retype the figures")`; act `it("sends the card after the words, once per turn")`, `it("sends no card beside the
  fallback line")`; turn `it("offers with a card on the LangGraph adapter")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/card.test.ts
  test/ai/natural/action-tools.test.ts test/ai/natural/act.test.ts test/ai/one/turn.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/natural test/ai/one` and
  `pnpm --filter @travel-crm/contracts test`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): the one agent's offer goes as a card with Book and Change`.

### Task 4: A tap books, or tells the agent what it means

The riskiest task in the four follow-on plans: money moves on a tap with no model to catch a mistake.

**Files:**
- Create: `packages/domain/src/ai/one/tap.ts`
- Modify: `one/turn.ts` (after the gates and the day's limits, before the model), `natural/fallback-line.ts`,
  `natural/tools/booking-checks.ts`
- Test: `packages/domain/test/ai/one/tap.test.ts` (real database, `test/ai/natural/support/live-agency.ts`)

**Interfaces:**
- Consumes: Task 3 (`tapOf`), core T5 (`stageAction(…, { agent: "one" })`), T6 (`refusalNote`), natural's `actOnTurn`,
  `doneOf`, `endedOf`.
- Produces:

```ts
// natural/fallback-line.ts
export function languageOf(text: string): "hindi" | "hinglish" | "english";   // the rule fallbackLine already uses
// natural/tools/booking-checks.ts
export function liveOfferOf(context: Pick<BookingContext, "facts" | "lines">): LiveOffer | null;
// one/tap.ts
export type TapStep = { done: TurnDone } | { notice: string } | null;      // null: the message is no tap
/** Reads the answered message's tap (input.token's button_reply_id) and books, or says what the model must know. */
export async function tapStep(turn: LiveTurn, actions: Omit<ActionContext, "quotedThisTurn">): Promise<TapStep>;
export function tapBookedLine(language: "hindi" | "hinglish" | "english"): string;   // BT5's three lines
```

Book on the live offer: `stageAction(actions, "book", <the offer's terms as book's arguments>, "", { agent: "one" })`;
staged → `actOnTurn(turn, { messages: [tapBookedLine(…)], staged, quoted: [figures], handOver: null, task: null,
model: null, fallback: null })` → `doneOf` (trace flag `tap:book`, no model call); refused by the stage or the act →
`{ notice: await refusalNote(…) }`. The notices:

```text
change: They tapped "Change something" on the offer (<terms>). Ask what they'd like to change.
stale:  They tapped "Book these seats" on an offer that is no longer live (<terms>). Nothing was booked. <The live
        offer is <terms>. | There is no live offer now.> Say so, and offer again if they still want it.
```

`runOneTurn` runs `tapStep` once the gates and limits passed: `done` ends the turn; a `notice` joins the context's
notice; `null` goes on as before. A nudge never reads taps.

- [ ] **Step 1: Write the failing tests:** `it("holds the seats on a Book tap and sends the line, the payment message
  and the QR, with no model call")`, `it("writes the line in the language they wrote in")`, `it("books nothing on a
  second Book tap, and tells the agent what stands")` (Review Focus 2), `it("books nothing on an old offer's tap, and
  names the live one")` (Review Focus 3), `it("books nothing when the seats went or the price changed, and gives the
  open dates")` (Review Focus 4), `it("runs the agent with a notice on Change")`, `it("answers a tap with no id as
  words")` (Review Focus 1), `it("never books a tap while the AI is paused, taken over or at its limit")`.
- [ ] **Step 2: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one/tap.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @travel-crm/domain test -- test/ai/one test/ai/natural`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): a tap on Book holds the seats, and Change or an old offer goes to the agent`.

### Task 5: Try it shows the card and takes a tap

**Files:**
- Modify: `contracts/src/ai/one-try-it.ts` (`tap`), `contracts/src/ai/natural-try-it.ts` (`naturalTestAnswer.card`),
  `natural/dry-answer.ts` (the card, for one's staged offer), `one/dry-turn.ts` (a tap with no model), web
  `test-natural-turn.tsx`, `test-section.tsx`, `use-ai.ts`, `ai.json`
- Test: `packages/contracts/test/ai/one-tools.test.ts`, `packages/domain/test/ai/one/try-it.test.ts`,
  `apps/web/test/ai/test-section-one.test.tsx`

**Interfaces:**
- Produces: `oneTestInput.tap: z.enum(["book", "change"]).optional()` (the last customer line is that tap on the
  state's live offer); `naturalTestAnswer.card: z.object({ body: z.string(), buttons: z.array(z.string()) }).optional()`
  (natural's answer never has one). In the web chat the latest answer's card shows its body and two outline buttons;
  tapping one sends the customer line "Tapped: <title>" with `tap`, as any turn.

- [ ] **Step 1: Write the failing tests:** domain `it("shows the card a test offer would send")`, `it("holds the seats
  on a test tap with no model call")`, `it("runs the agent with a notice on a test Change")`; contracts `it("takes a tap
  only as book or change")`; web `it("shows the card's buttons and sends a tap")`.
- [ ] **Step 2: Run** the three test files; expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, `pnpm --filter @travel-crm/web typecheck` and the domain's `test/ai/one`; expect PASS.
- [ ] **Step 5: Commit** `feat(ai): Try it shows the offer card and takes a tap`.

## Before agencies use buttons

- [ ] The owner taps Book once on the pilot number; the raw webhook body is read once by hand (never logged by code),
  and `parse-msg91-event.ts`'s aliases are fixed if the id came elsewhere (ruling BT7).
