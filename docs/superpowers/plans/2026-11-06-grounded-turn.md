# The grounded turn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For an agency that switches to it, every WhatsApp turn of the AI runs a fixed pipeline. The model reads the chat into checked facts. Code looks up the agency's sellable packages. The model writes words with placeholders, and code fills them in. Code checks the reply and acts. Every place, price, date, file and payment detail a customer gets therefore comes from an approved package, written by code.

**Architecture:** A new folder `packages/domain/src/ai/grounded/` holds one file per step: `read.ts`, `lookup.ts`, `card.ts`, `write.ts`, `fill.ts`, `check.ts`, `act.ts`, and `turn.ts` to orchestrate. `runAgentTurn` hands the turn to `runGroundedTurn` when the agency's `grounded` switch is on; the old agent is untouched otherwise. Model calls go through the existing `AiModel` port, which gains structured output: a JSON Schema made from our Zod contracts, sent as OpenRouter's `response_format: json_schema`, and parsed by Zod in the domain, where an answer that doesn't fit is no answer. The chat's state is code-kept JSON on `ai_chat.facts`, validated by a contract.

**Tech Stack:** Prisma 7.10 + Postgres (RLS), Zod 4 (`z.toJSONSchema`), tRPC, Next.js web (shadcn registry), Vitest, Playwright, OpenRouter through our own adapter.

**Spec:** `docs/superpowers/specs/2026-11-05-grounded-sales-agent-design.md`, sections 3, 5, 6, 7 and 8 and decisions 1-12. This is plan 4 of 4. Plans 1-3 (group packages, package drafts, payments to check) are built on this branch. The research map is in the controller's scratchpad; its facts are copied into each task below.

**Calls I made where the spec left them to the builder or marked them "my call":**
- **No Vercel AI SDK.** The pipeline uses no tools, so the SDK would add only `generateObject`. Our adapter already handles zero-data-retention routing, per-feature model lists, 429 rests and the backup model. Structured output there means no new dependency, no bundle or audit change.
- **Both model calls use the existing feature `autopilot`**, so its model lists and backup apply unchanged.
- **Nearest packages:** the read step picks up to three of the agency's sellable packages for a place the agency doesn't run. Code keeps only real keys.
- **No agency-default payment QR.** A package sends its own QR. Payment text is the package's, else the agency's (`ai_autopilot.payment_details`).
- **Voice notes** still reach the model as `[audio]`. The reply asks the customer to type.
- **Placeholders are `[kind P<n> …]`** (Task 3). Amounts reach customers in whole rupees, "₹6,999" (paise only when they aren't zero). Dates read "Sat 14 Nov", with the year added when it isn't this year.

## Global Constraints

- The repository's CLAUDE.md holds in full:
  - forOrg, with RLS and a fixture for every new org table;
  - strict Zod inputs and z.object outputs;
  - audit for staff changes, and for the AI's messages as today (`ai.message-sent`);
  - errors.json and audit.json sentences;
  - registry components only, and every word a message;
  - the Logger port: block reasons and outcomes as codes, never customer words.
- The old agent stays as it is (owner decision 1). Its `parseAnswer`, `agentAnswer`, `knowledgePack` and prompt are not changed. Only an agency with `ai_autopilot.grounded = true` runs the new turn.
- No customer message carries an amount, a date, a payment detail, or a place outside the turn's packages, unless code wrote it. A reply that fails the check is asked for once more with the reason. If it fails again, nothing is sent and the chat is flagged to the team.
- The agent never says a payment was received or a booking confirmed, and has no action that does.
- The QR and payment details go only when every condition in Task 6's `allowedActions` holds, including that the customer said they want to book.
- Every model call reserves one call of the monthly limit (`reserveAiCall`), and releases it when nothing usable came back. `MONTHLY_AI_LIMIT` becomes 8,000.
- Every check that runs before the AI writes today runs unchanged: plan, subscription, monthly limit, 24-hour window, STOP, the chat already answered, the daily cap, a person answering, hand-over. That is `mayWrite`, exported for reuse.
- Every message the new turn sends has a client token starting `ai:`, so it is marked and counted as the AI's. A repeat of the same turn token sends nothing new and makes no second booking, hold or quote.
- Customers' words are data. They go to the model fenced as today (`fenced`), and a read fact counts only when its evidence is in the customer's own messages.
- Money is integer paise (`bigint` in new columns). Departure and season days are `CalendarDate`. Dates on screen use the kernel's formatting.
- Every shell command starts with `cd /Users/ak/personal/travel-crm-agent && source ~/.nvm/nvm.sh && nvm use >/dev/null &&`.
- Keep CPU low:
  - vitest `--maxWorkers=2`, Playwright `--workers=1`;
  - lint changed files per package, never eslint from the repo root;
  - Docker only for a run, then down.
- Never `git stash`. Use Conventional Commits staged by name, with no `Co-Authored-By`.

## Review Focus

1. A customer names two places in one message, one the agency runs and one it doesn't. The reply covers both, the check allows both, and the team is flagged once (Tasks 4, 6, 8).
2. A date in no season, or a full or closed departure, gets "the team will confirm": no amount, no QR (Tasks 3, 6).
3. "Book it" with the room split unknown gives no QR and no booking. The reply asks how they'll share (Task 6).
4. A retried job with the same token sends one message and makes one booking, one hold and one quote (Tasks 7, 8).
5. Numbers that aren't money or dates never block: "5N6D", "2 adults", "4,500 ft", "Day 3", "+91 98…" in a pickup line. Hinglish and Hindi payment claims ("payment mil gaya", "पेमेंट मिल गया") always block (Task 4).

---

### Task 0: Carry-overs from plans 1-3

**Files:** `packages/domain/src/departures/package-departures.ts`, `packages/domain/src/ai/seats/write-message.ts`, `packages/domain/src/departures/departures.ts` (`auditView`), `packages/contracts/src/quotes/packages.ts` (`makeGroupQuoteInput`), `apps/web/src/i18n/messages/en-IN/errors.json` (ATTACHMENT_TYPE), and their tests.

- [ ] **Step 1: Failing tests.**
  - `"a schedule change cancels future generated departures that no longer match, and keeps any with a booking or hold"`. Generated departures carry their scheduled day. A departure with sales or holds is kept, and the team gets a notice.
  - `"the seats message reads the departure's price from priceOn"`. `write-message.ts:93,151` read the legacy `departure.pricePaise`, which generated departures leave null.
  - `"updating a departure audits its package and own prices"`.
  - `"a group quote with the same room type twice is refused"`. Add a contract refine, plus a domain check for callers that skip the contract.
  - The ATTACHMENT_TYPE sentence no longer says WhatsApp, because uploads raise it too.
- [ ] **Step 2–4:** RED; implement; GREEN (departures, ai seats and quotes tests).
- [ ] **Step 5:** Commit `fix(departures): schedule changes reach generated departures, and seat words read the season price`.

### Task 1: Structured output through the port

**Files:**
- Modify `packages/integrations/src/ai/ai-model.ts` (`AiRequest`), `openrouter.ts`, `fallback.ts` and `memory-ai.ts`.
- Modify `apps/web/test/e2e/support/fake-openrouter.ts`, which must accept `response_format.json_schema`.
- Tests in `packages/integrations/test/ai/`.

**Interfaces:**
- `AiRequest` gains `schema?: { name: string; jsonSchema: Record<string, unknown> }`. The caller builds `jsonSchema` with `z.toJSONSchema(contract)`, using no transforms.
- The OpenRouter adapter sends `response_format: { type: "json_schema", json_schema: { name, strict: false, schema } }`. On a 404, or a 400 saying no endpoint supports the parameters, it retries the same model once with `{ type: "json_object" }` and the schema appended to the system message as "Answer as JSON matching: <schema>". Then the model list goes on as today.
- ZDR (`provider.zdr`, `require_parameters`), the 429 rests and `withBackupModel` are unchanged. `withBackupModel` passes `schema` through.
- `createMemoryAiModel` records the schema in `requests`.
- A new domain helper `askFor<T>(model, request, contract: z.ZodType<T>)` in `packages/domain/src/ai/grounded/ask.ts` returns `{ ok: true, value: T, model, inputTokens, outputTokens } | { ok: false, reason: AiFailure | "unfit" }`. It calls with `schema`, takes the JSON object out of the text (`jsonObjectIn`), and returns `"unfit"` when the object is missing or fails `contract.safeParse`. There is no prose fallback.

- [ ] **Step 1: Failing tests.**
  - `"a schema request sends json_schema with ZDR"`.
  - `"a model with no json_schema endpoint is asked again in json mode with the schema"`.
  - `"the backup model gets the same schema"`.
  - `"askFor returns unfit for prose or a wrong shape, and the value for a fitting answer"`.
- [ ] **Step 2–4:** RED; implement; GREEN (integrations ai tests, a domain test for `askFor`).
- [ ] **Step 5:** Commit `feat(ai): ask a model for an answer that fits a schema`.

### Task 2: Schema — the switch, the chat's facts, the limit

**Files:**
- Create migration `packages/db/prisma/migrations/20261208100000_grounded_agent/migration.sql`.
- Modify `packages/db/prisma/schema/ai.prisma`.
- Create `packages/contracts/src/ai/grounded.ts`.
- Modify `packages/domain/src/ai/usage.ts` and `docs/deploy-checklist.md:266`.

**Interfaces:**
- `ai_autopilot.grounded boolean NOT NULL DEFAULT false`.
- `ai_chat.facts jsonb NOT NULL DEFAULT '{}'`. It only adds, and is applied by hand before deploy like plan 3's.
- `chatFacts` (z.object; every field defaults, so `{}` parses):
  - `places: { destinationId: string | null; words: string }[]`;
  - `notRun: string[]`, the customer's words for places without a package;
  - `startsOn: CalendarDate | null`, `month: "YYYY-MM" | null`;
  - `rooms: roomBooking[]` (from `C/quotes/room-prices.ts`), `travellers: number | null`;
  - `budgetPaise: number | null`, `pickupCity: string | null`;
  - `packageId: string | null`, `departureId: string | null`;
  - `sentFileIds: string[]`, `paymentSentFor: string | null` (departure id), `bookingId: string | null`.
- `readFacts(tx, conversationId): ChatFacts` and `saveFacts(tx, conversationId, facts)` in `packages/domain/src/ai/grounded/facts.ts`. A row that doesn't parse reads as `{}`.
- `MONTHLY_AI_LIMIT = 8000`. Update every test that names it and the deploy checklist line.
- Erasure: check that `D/ai/erasure.ts` removes or clears the person's `ai_chat` rows. Make sure `facts`, which holds customer words, goes with them.

- [ ] **Step 1: Failing tests.**
  - `"facts round-trip and a bad row reads as empty"`.
  - `"erasing a customer clears their chat facts"`.
  - Db tests for the migration (`pnpm migrations:check`).
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(db): a grounded switch, a chat's facts, and a larger AI limit`.

### Task 3: Look up packages, build the card, fill the placeholders

**Files:**
- Create `packages/domain/src/ai/grounded/lookup.ts`, `card.ts` and `fill.ts`.
- Modify `packages/domain/src/quotes/room-prices.ts` (add `fromPrices`) and `packages/domain/src/departures/` (export `openDeparturesOf`).
- Tests in `packages/domain/test/ai/grounded/`.
- Check `.dependency-cruiser` for the new `ai → quotes` edge. If `business-modules-call-down` forbids it, import through `departures`, which already imports quotes. Say which in the report.

**Interfaces:**
- `fromPrices(seasons: SeasonPrices[], departures: OwnPrices[], today: CalendarDate, offered: RoomType[]): RoomPrices` gives the lowest price per offered room type over seasons ending on or after today and open departures' own prices.
- `openDeparturesOf(tx, packageId, today, now): { id, startsOn: CalendarDate, freeSeats: number }[]` returns open departures not past their cut-off with free seats above 0, soonest first, at most 3. It is built from `seatsSoldAndHeld` and `countsOf`.
- `lookUp(tx, facts: ChatFacts, today, now): Lookup` returns:
  - for each place with a destination, its sellable packages, from `sellablePackages(tx, today)` filtered by `destinationId`;
  - for each package, its kind, offered room types, the date's prices (`priceOn`) when `startsOn` is known, else `fromPrices`, its open departures, `advancePerPersonPaise`, whether it has a QR or payment text, and its files not yet in `sentFileIds`;
  - `total` from `totalFor(prices, rooms)` only when every traveller has a priced room type and `rooms` covers `travellers`;
  - the matching departure when `startsOn` equals an open departure's day;
  - for `notRun` words, `customTrips` (`aiSettingsOf`) and the nearest keys from the read step.
- A custom package gives only `from` prices, no totals and no departures.
- `buildCard(lookup): Card` returns `{ text: string; values: Map<string, string> }`.
  - Packages are keyed `P1…Pn` in lookup order.
  - The text lists, for each package, its title, destination, nights, summary, highlights, inclusions and exclusions, itinerary day titles, and pickup and start city, plus the placeholders that have values. Values are not in the text.
- Placeholders and their values:
  - `[price P1 double]` is the per-person price on the asked date;
  - `[from P1 double]` is the lowest coming price;
  - `[total P1]` is the chat's rooms on the asked date;
  - `[departure P1 1]` … `[departure P1 3]` are the next departures' days, and `[departure P1]` is the chosen one;
  - `[seats P1 1]` is the seats left;
  - `[advance P1]` is per person, and `[advance total P1]` is per person × travellers;
  - `[pickup P1]` is the pickup points' text.
  - Money is whole rupees "₹6,999" (with paise only when they aren't zero), through a new `formatRupees` beside `formatMoney` in the kernel. Dates are "Sat 14 Nov", with the year added when it isn't this year.
- `fillPlaceholders(text, card): { text: string; filled: { start: number; end: number }[]; unknown: string[] }`. A placeholder with no value is `unknown`.

- [ ] **Step 1: Failing tests.**
  - `"a December date prices from the peak season, a departure's own price wins"`.
  - `"a date in no season has no price placeholder"`.
  - `"a full, closed or past-cut-off departure is never offered"`.
  - `"a total needs every traveller roomed"`: 5 people with no split gives no total; one triple and one double gives a total.
  - `"from prices take the lowest coming season per room type"`.
  - `"a custom package has from prices only"`.
  - `"files already sent are left out"`.
  - `"placeholders fill with ₹6,999 and Sat 14 Nov, and an unknown one is reported"`.
  - `"a package of another destination is not looked up"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(ai): look up a chat's packages and write their facts by code`.

### Task 4: Check a reply

**Files:**
- Create `packages/contracts/src/ai/reply-words.ts`, shared with the settings warnings (Task 9) because the web may import contracts at run time.
- Create `packages/domain/src/ai/grounded/check.ts`.
- Tests in `packages/contracts/test/ai/` and `packages/domain/test/ai/grounded/`.

**Interfaces:**
- `amountsAndDatesIn(text): { start, end, kind: "money" | "date" }[]`.
  - Money is a number joined to a currency mark (₹, Rs, Rs., INR, rupees, /-), a number with k, K, L, lakh or lac, or a grouped or 4+ digit number within three words of: per person, pp, per head, each, total, advance, price, cost, only, rate, package, booking.
  - A date is a day number with a month name either way round, d/m or d-m with an optional year, or "kal", "parso", "tomorrow" or a weekday next to a day number.
  - Month names alone, nights and days counts ("5N6D", "5 nights", "Day 3"), people counts, heights and phone numbers are not matches.
- `indianTravelPlaces: string[]`: about 150 common places (states, hill stations, regions, popular towns and treks), in lowercase.
- Phrase lists, each in English, Hindi (Devanagari) and Hinglish:
  - `paymentClaimPhrases`, e.g. "payment received", "received your payment", "booking is confirmed", "seats confirmed", "payment mil gaya", "booking confirm ho gayi", "पेमेंट मिल गया";
  - `teamClaimPhrases`, e.g. "the team said", "team gave", "as discussed with the team", "team ne bataya";
  - `notRunPhrases`, e.g. "we don't run", "we do not operate", "not available", "hum … nahi karate";
  - `customTripPhrases`, e.g. "custom trip", "the team will send a quote".
- `checkReply(text, filled, context: { packagePlaces: string[]; notRun: string[]; customTrips: boolean; knownPlaces: string[] }): { ok: true } | { ok: false; reason: "amount" | "date" | "place" | "payment_claim" | "team_claim"; excerpt: string }`.
  - An amount or date outside the `filled` spans is refused.
  - A known place that is neither in `packagePlaces` nor in `notRun` is refused.
  - A sentence naming a `notRun` place must hold a not-run phrase, or a custom-trip phrase when `customTrips` is on.
  - A payment or team claim is refused.
  - Known places are the agency's destinations plus `indianTravelPlaces`. Package places are the known places that appear in the card's package texts.
- `withoutAmountsAndDates(text): string` removes every span `amountsAndDatesIn` finds. Task 9 uses it for lessons.

- [ ] **Step 1: Failing tests.** Table tests with the spec's evidence:
  - `"Manali 5N6D December peak ₹7,999"` typed: amount.
  - The same through a placeholder: ok.
  - `"Spiti"` named on a Manali-only card: place.
  - `"We don't run Kashmir, but our Manali trip…"`: ok.
  - `"Kashmir is lovely in December"` with Kashmir not run: place.
  - `"we have received your ₹4,000"` and the Hindi and Hinglish forms: payment_claim.
  - `"the team gave me the pricing"`: team_claim.
  - The Review Focus 5 non-matches: ok.
  - `"Rs 6999/- only"`, `"7.5k"`, `"1.2 lakh"`: money.
  - `"14 Nov"`, `"Nov 14"`, `"14/11"`, `"Saturday 14th"`: date.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(ai): refuse a reply holding a fact code didn't write`.

### Task 5: Read the chat

**Files:** create `packages/domain/src/ai/grounded/read.ts` and the contract `readAnswer` in `packages/contracts/src/ai/grounded.ts`; tests.

**Interfaces:**
- `readAnswer` (z.object):
  - `places: { destination: string /* D-key or "none" */; words: string; evidence: string }[]`;
  - `startsOn: { date: CalendarDate | null; month: string | null; evidence: string } | null`;
  - `rooms: { type: RoomType; count: int 1..6; evidence: string }[]`, `travellers: { count: int 1..40; evidence: string } | null`;
  - `budgetRupees: { amount: int; evidence: string } | null`, `pickupCity: { words: string; evidence: string } | null`;
  - `chosen: { package: string /* P-key */; evidence: string } | null`;
  - `wants: "information" | "price" | "brochure" | "book" | "paid" | "person" | "about_agency" | "other"`, `wantsEvidence: string`;
  - `special: { kind: "discount" | "b2b" | "private" | "group_rate" | "other_price"; evidence: string } | null` (owner decision 4: any price the packages don't hold);
  - `nearest: string[]` (P-keys, at most 3).
- `readChat(model, input: { transcript: ChatLine[]; destinations: { key, id, name }[]; packages: { key, id, title, destination }[]; facts: ChatFacts; today: CalendarDate; timeZone }) → { ok: true; read: ReadAnswer; usage } | { ok: false; reason }`.
  - It uses `askFor` with feature `autopilot` and the system marker `READ_CHAT.`.
  - Customer lines are fenced; the agent's lines are labelled as ours.
- `checkedRead(read, customerTexts: string[], keys): ReadAnswer`.
  - It drops every fact whose evidence, normalised (case, whitespace, punctuation), is not inside one customer message.
  - It drops unknown D- and P-keys.
  - A date before today is dropped.
- `mergeFacts(facts, read, keys): ChatFacts`.
  - Newer facts replace older ones of the same kind, and places accumulate.
  - A new place or new dates clear `packageId` and `departureId` unless they still fit.
  - Merging is code; the model never writes facts.

- [ ] **Step 1: Failing tests.**
  - `"evidence the customer didn't write is dropped"`: the agent's own words don't count.
  - `"Meghalaya is read as not run when no destination matches"`.
  - `"a place in the list maps to its destination"`.
  - `"2 people double sharing reads as one double room"`.
  - `"a past date is dropped"`.
  - `"an unfit answer is no read"`.
  - `"nearest keeps only real package keys"`.
  - `"merging a new place clears the chosen package"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(ai): read a chat into facts the customer said`.

### Task 6: Write the reply

**Files:** create `packages/domain/src/ai/grounded/write.ts`, `actions.ts` and `prompt.ts`; the contract `writeAnswer`; tests.

**Interfaces:**
- `allowedActions(lookup, facts, read, context: { natural: boolean; hasLead: boolean; settings }): AllowedActions`.
  - `sendFiles(P)` is allowed when that package has unsent files and the customer wants a brochure, information or a price.
  - `sendAgencyFiles` is allowed when they want to know about the agency (the general files, Task 9).
  - `sendPayment` and `requestBooking` need every one of these:
    - they want to book;
    - a group package is chosen, or only one is in play;
    - the departure is known and open, with free seats at least the travellers;
    - every traveller has a priced room type;
    - the advance is above 0;
    - a QR or payment text exists;
    - the chat has a lead;
    - the chat is not natural;
    - `paymentSentFor` is not this departure.
  - `flag` and `handOver` are always allowed. `note` follows `settings.leadNotes`, and `task` follows `settings.followUpTasks`.
  - Code adds a flag itself, whatever the model chose, in two cases: a `notRun` place this turn (decision 10, custom trips on or off), and a `special` price ask (decision 4). The reason is a code, e.g. `not_run`, `special_price`.
- `writeAnswer` (z.object):
  - `reply: string (1..1000)`;
  - `actions: { sendFiles: string[]; sendAgencyFiles: boolean; sendPayment: boolean; requestBooking: boolean; flag: string | null; handOver: string | null; note: string | null; task: { title: string; dueInHours: int 1..168 } | null }`.
- `groundedPrompt(...)`:
  - The role is a helpful travel salesperson for the agency who never invents facts. It has no "closer" wording, and the natural role keeps the old `naturalRole` tone.
  - It reuses `voiceWriting`/`genericWriting` and the agency and chat voice from `agent-prompt.ts`.
  - It includes the Instructions and Strict rules as behaviour.
  - Knowledge is only the `ai_knowledge` pieces, ranked as today, without quote templates or trip kits. Give `knowledgePack` an option, leaving the old agent's behaviour unchanged.
  - Lessons are stripped of amounts and dates (Task 9).
  - It includes the card and the allowed actions.
  - It states the rules:
    - Write every amount, date and payment detail only as a placeholder from the card.
    - When nothing fits, say the team will confirm.
    - For a place not run, follow the custom-trips rule.
    - When they want to book and the split is unknown, ask how they'll share.
    - Never say money arrived; for "I've paid", say the team will check it.
  - The system marker is `WRITE_REPLY.`.
- `writeReply(model, input, reason?: string)` uses `askFor` with feature `autopilot`. `reason` carries a re-ask's check failure, or a nudge or follow-up reason.

- [ ] **Step 1: Failing tests.**
  - `"no payment before they say they want to book"`: "2 people", "double sharing" and "yes" alone allow no payment.
  - `"booking needs a split, an open departure and a price"`, one test per missing condition.
  - `"natural chats never get payment or booking"`.
  - `"a place not run, or a discount ask, is flagged by code"`.
  - `"a second payment for the same departure isn't allowed"`.
  - `"the prompt has no package prices or kit text"`.
  - `"actions not allowed are dropped"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(ai): write a reply from the card, with only the actions code allows`.

### Task 7: Act

**Files:**
- Create `packages/domain/src/ai/grounded/act.ts`.
- Modify `packages/domain/src/departures/group-quote.ts`, `holds.ts` and `packages/domain/src/quotes/quotes.ts`. Each gets an inner function taking an `Actor` with the lead known; the `MemberAccess` wrapper keeps its scope checks and calls it.
- Modify `packages/domain/src/quotes/package-files.ts` to add an `Actor` listing.
- Tests.

**Interfaces:**
- `actOnReply(tx, deps, { organizationId, conversationId, token, text, actions, lookup, facts, now }): ActResult`, in one transaction.
  1. If a message with client token `ai:<token>` exists, return `"already"`.
  2. For `requestBooking`:
     - `createHoldFor(tx, actor, { leadId, departureId, seats: travellers, hours: departureSettingsOf().holdHours })`, skipping `HOLD_EXISTS`;
     - then `makeGroupQuoteFor(tx, actor, { leadId, packageId, departureId, rooms }, context, today)`;
     - then an `ai_booking` with id `uuidFromKey("ai-booking:" + token)`, status `awaiting_payment`, `quoteId`, `expectedPaise = advance × travellers`, and `details` written by code (package title, departure day, rooms, total);
     - then `advanceLeadStage(… "booking_requested")`, the lead note and the `ai.booking` notice, as `takeBooking` does.
     - Any refusal throws, so nothing is sent; the turn flags the team with the reason.
  3. Send the reply with `queueSystemText` and token `ai:<token>`, audit `ai.message-sent`.
  4. Send files in order:
     - the package files (copy as `sendChosenMedia` does) with tokens `ai:<token>:f<n>`;
     - the agency's general files when allowed;
     - for `sendPayment`, the package QR (`ai:<token>:qr`) and the payment text (`ai:<token>:pay`). The text is filled by code and reads "Advance to book: [advance total P1]", then the package's payment text, else the agency's.
  5. Flag or hand over through the existing `ai_chat` fields and `tellOwner`. Note and task as `applyAnswer` does.
  6. `saveFacts`, adding the sent file ids, `paymentSentFor` and `bookingId`.
- Seat holds and quotes made this way audit as the system actor.

- [ ] **Step 1: Failing tests.**
  - `"a booking request holds the seats, makes the group quote at the told total, and an AI booking with its quote and advance"`.
  - `"the same token twice acts once"`.
  - `"no seats left: nothing sent, the team flagged"`.
  - `"every message is marked as the AI's"`; the payment text is no longer `ai-pay:`.
  - `"files go once per chat"`.
  - `"the payment text carries the code's advance total"`.
- [ ] **Step 2–4:** RED; implement; GREEN (domain departures, quotes and ai tests).
- [ ] **Step 5:** Commit `feat(ai): act on a checked reply — send, hold seats, make the quote`.

### Task 8: The turn

**Files:**
- Create `packages/domain/src/ai/grounded/turn.ts`.
- Modify `packages/domain/src/ai/agent.ts`: export `mayWrite`, and delegate when `autopilotOf(tx).grounded`.
- Modify `follow-up-work.ts` (`outcomeOf` learns the new outcomes).
- Tests.

**Interfaces:**
- `runGroundedTurn(deps, input: { organizationId, conversationId, kind: TurnKind, token, followUp? }, now): Promise<TurnOutcome>`.
  1. Prepare in one transaction: the same checks in the same order as today (`mayWrite`, plan, limit), the facts, the transcript, destinations and sellable packages.
  2. For `reply`, reserve and read outside any transaction, then `checkedRead` and `mergeFacts`. Nudges and follow-ups skip the read.
  3. Look up and build the card, then reserve and write.
  4. Fill the placeholders and check. An `unknown` placeholder counts as a failure. On failure, reserve and write again once with the reason. If it fails again, flag with the reason code and send nothing (outcome `blocked`).
  5. Act. A booking refusal also gives `blocked` with its reason.
  6. Record tokens. Release a reservation when a call gave nothing.
- Nudges ("they went quiet") and follow-ups ("this follow-up is due: <title>") give `reason` to the write step. Only `sendFiles`, `flag` and `note` are allowed for them.
- Outcomes are today's strings plus `blocked` and `unfit`. Log `{ event: "ai.turn", outcome, reason? }` with no words.

- [ ] **Step 1: Failing tests,** with `createMemoryAiModel` scripted with a read answer and a write answer.
  - `"a switched agency's turn reads, writes and sends the code's price"`.
  - `"a typed price is asked again, then sent through a placeholder"`.
  - `"blocked twice: nothing sent, the chat flagged with the reason"`.
  - `"each model call counts against the monthly limit"`.
  - `"every check before writing still stops the turn"`: window, STOP, person answering, daily cap.
  - `"an agency not switched runs the old agent"`.
  - `"Spiti and Manali in one message: one reply covers both, one flag"`.
  - `"a nudge writes from the facts without reading"`.
- [ ] **Step 2–4:** RED; implement; GREEN (domain ai tests, including the old `autopilot.test.ts`).
- [ ] **Step 5:** Commit `feat(ai): the grounded turn`.

### Task 9: The switch and the settings

**Files:**
- Contracts: `packages/contracts/src/ai/autopilot.ts` (`grounded`).
- Domain: `packages/domain/src/ai/autopilot.ts`, `learning.ts` and `learning-store.ts`, and `packages/domain/src/inbox/trip-kit-send.ts`, `automation.ts`.
- Web: `apps/web/src/ai/autopilot-section.tsx`, `ai-settings-screen.tsx`, `payments-card.tsx` (Strict rules), `media-section.tsx`, and messages.
- Tests.

**Interfaces:**
- `saveAutopilot` accepts `grounded`. Turning it on with no `sellablePackages(tx, today)` is refused with `NO_SELLABLE_PACKAGES` ("Make at least one package sellable by the AI first."). The change is audited in its switches.
- The web shows a Switch, "Answer from your packages only", with an InfoHint and a WriteHint, and the refusal through RefusalAlert.
- For a grounded agency:
  - `sendTripKitOnKeyword` sends nothing, and `automationCouldAct` stops counting keyword kits. Staff still send kits from the chat.
  - The media section is titled "Files about your agency" and hides "when to send".
  - Task 7 sends these files, up to `MAX_AI_MEDIA_PER_REPLY`, with `listMedia`'s ready and enabled items.
- The Instructions and Strict rules editors show a registry `Alert` when `amountsAndDatesIn(text)` finds anything: "Prices and dates belong in your packages. The AI won't send them from here."
- Lessons:
  - `withoutAmountsAndDates(text)` removes matched spans (contracts, Task 4). It runs before a lesson is saved and on the lessons given to the grounded prompt.
  - The learn prompt asks only for how customers talk and what they ask.

- [ ] **Step 1: Failing tests.**
  - `"turning grounded on needs a sellable package"`.
  - `"a grounded agency's keyword kits don't send"`.
  - `"a lesson keeps no amount or date"`.
  - Web: `"the editors warn about a price"`, `"the switch shows the refusal"`, `"general files hide when to send"`.
- [ ] **Step 2–4:** RED; implement; GREEN.
- [ ] **Step 5:** Commit `feat(ai): switch an agency to answering from its packages`.

### Task 10: The test set

**Files:**
- Create `packages/contracts/src/ai/agent-cases.ts`, the case format.
- Create `packages/domain/src/ai/grounded/evaluate.ts`.
- Create `packages/domain/test/ai/grounded/cases/*.json`, about 25 hand-written cases.
- Create `packages/domain/test/ai/grounded/cases.test.ts`.
- Create `apps/api/src/agent-cases.ts` with a `package.json` script `agent-cases`.

**Interfaces:**
- `agentCase` describes:
  - the agency, as references to a shared seed: Manali group with Nov and Dec–Jan peak seasons, triple and double, and departures; Spiti group; Kashmir custom; custom trips on or off;
  - the chat, as lines;
  - for CI only, `scripted: { read, write[] }`;
  - `expect: { sent: boolean; includes?: string[]; excludes?: string[]; actions?: …; flagged?: boolean; blockedReason?: … }`.
- `seedCaseAgency(tx, …)` and `runAgentCase(deps, organizationId, agentCase, now): CaseResult` in `evaluate.ts`.
- `cases.test.ts` runs every repository case against the memory model.
- The cases come from the audit's incidents, anonymised:
  - Meghalaya asked, Spiti PDF;
  - "Spiti or Kashmir for snow";
  - Kasol asked, Manali price;
  - ₹7,999 typed;
  - "final B2B rate";
  - "team gave the pricing";
  - a QR on "2 people", "double sharing" and "yes";
  - "we have received your ₹4,000";
  - a date in no season;
  - five people with no split;
  - a voice note;
  - a request for a person;
  - Hinglish and Hindi.
- `pnpm --filter @travel-crm/api-server run agent-cases -- --dir <path>` runs JSON cases against a throwaway local organization with the real model from `.env`. It never runs in CI and needs `pnpm db:up`. It prints one line per case and expectation, then removes the organization. The private real cases live in `~/.config/travel-crm/agent-cases/`, outside the repository. The controller writes them from the audit, not this task.

- [ ] **Step 1:** Write the cases and the failing `cases.test.ts`. RED, because `evaluate.ts` doesn't exist.
- [ ] **Step 2–4:** Implement; GREEN. Run the runner once by hand against two repository cases with the memory model (`--fake`), to prove it works without a key.
- [ ] **Step 5:** Commit `test(ai): a test set for the grounded agent, and a runner for real cases`.

### Task 11: Journey

**Files:** create `apps/web/test/e2e/grounded-agent-journey.spec.ts`; modify `apps/web/test/e2e/support/fake-openrouter.ts` (answers for `READ_CHAT.` and `WRITE_REPLY.`, scripted per test like the existing ones).

- [ ] **Step 1: The journey.**
  - The owner makes the Manali group package sellable and turns on "Answer from your packages only". The refusal shows first, with no sellable package.
  - A customer asks for Spiti with custom trips off. The chat shows "we don't run Spiti" and a Manali suggestion, and the chat is flagged.
  - They ask for Manali, double, in December. The chat shows the peak season's price as code wrote it.
  - The fake writer types ₹7,999 twice. Nothing is sent, and the chat shows the team flag.
  - "Book for 2, double, 12 Dec". The QR and the payment text with ₹ advance × 2 are sent, the departure shows 2 seats held, and the AI booking appears on Payments to check with that expected amount.
  - `expectAccessible` runs on the AI settings and the chat, on phone and desktop.
- [ ] **Step 2:** Run the journey, `--workers=1`, then Docker down.
- [ ] **Step 3:** Typecheck the touched packages and lint the changed files.
- [ ] **Step 4:** Commit `test(web): an agency answers from its packages only`.
