# One WhatsApp agent: design

Status: written 2026-11-17 from the owner's decisions of that day, without a further round of questions (the owner asked
for the design straight from the decisions). Marks used below:
- **(owner)**: the owner's decision, binding.
- **(lead)**: the development lead's call, open to the owner's change.
- **Open**: still waiting on the owner. Section 13 lists the open items.

This spec replaces both of today's agents with one. It keeps:
- the plumbing: the agency's setup, the pause, the inbox, follow-ups, Try it, and the traces;
- most of the natural agent's prompt and tools (`2026-11-14-natural-whatsapp-agent-design.md`, code in
  `packages/domain/src/ai/natural/`).

## 1. Why

Today two agents answer WhatsApp: lite (a fixed pipeline) and natural (the model with tools, live since PR #58), chosen
per agency. Both run on a hand-written loop with string-matching checks on the reply's words. The owner wants (owner):
- one agent, built on an agent framework, before any more features are added;
- fewer code checks, and more trust in the prompt and the model;
- a model that can actually hear voice notes and see images;
- a chat history that hides nothing and doesn't forget long chats;
- a booking yes that can't be misread.

## 2. Goals, non-goals, anti-goals

Goals:
- One agent on **LangGraph** (JS) answering every agency's WhatsApp. Lite and natural are deleted after the move (owner).
- The model reads a running **chat summary** plus every message after it, instead of the last 40 lines (owner).
- **Booking by button:** the offer arrives with "Book these seats" and "Change something" buttons (owner).
- **Voice notes and images** reach the model through tools (owner).
- **Brochures** carry an owner-written name and description, and the agent picks one by those (owner).

Non-goals:
- New sales features (new tools beyond those listed here, campaigns, multi-agent setups). They come after the move.
- Changing how a booking, a hold, a payment or a follow-up works in the CRM itself.

Anti-goals: the move fails if any of these happen, even if the agent "works":
- a customer gets silence where today they'd get a reply (since 2026-11-24 a fallback sends nothing, by the owner's
  choice: the team's task stands for the reply);
- seats are held, or a QR goes out, without the message that explains it;
- one agency's data reaches another agency's chat;
- a payment is confirmed by the AI.

## 3. What stays as it is

These parts stay. The builder reuses the code; the framework only replaces the loop:
- **Which agency is answering** is resolved from the WhatsApp business number a message was sent to
  (`inbox/routes.ts`). The agency's id travels with the job, and every read and write runs inside `forOrg` (owner:
  keep).
- **The worker:**
  - a customer's message queues a turn 3 s later, so a burst is read as one;
  - only the newest message is answered;
  - a turn whose model is down runs again after two waits, then leaves the team a task and sends nothing
    (`ai/agent-worker.ts`).
- **The gates** before any model call:
  - the agency's "Use the AI" switch;
  - its plan and subscription;
  - the platform pause;
  - a person who took the chat over;
  - the day's reply cap and the month's AI limit.
- **Follow-ups:** the model says roughly when ("tomorrow morning"), and code places the time between 9 am and 9 pm,
  inside WhatsApp's 24-hour window, at most twice. These are WhatsApp's rules and the agency's hours, not checks on
  words.
- **The agency block and the trip sheets** the model reads (`context/agency-block.ts`, `trips/`), the labels T1, T2…,
  and the lookups `find_trips`, `get_trip` and `quote`.
- **Prompts in Langfuse:** label `production` for live and `draft` for Try it, with the built-in text as the fallback
  when Langfuse can't answer.
- **Try it**, the console's "Why", and one Langfuse trace per turn.

## 4. The agent on LangGraph

### 4.1 Where it lives
ADR 0008 holds: domain code never imports a vendor library. LangGraph and LangChain live in `packages/integrations`,
behind a new port (lead). The rough shape:

```ts
// packages/integrations/src/agent/  (name: builder's call)
runToolAgent({
  system, messages,                // what the model reads
  tools: [{ name, description, schema /* zod */, run: (args) => Promise<string> }],
  model, tracing,                  // OpenRouter model list, Langfuse
}): Promise<{ reply: string; transcript: AiMessage[]; usage: … }>
```

The domain supplies the tools as plain functions. Each one runs inside the turn's `forOrg` transaction for its agency,
so the framework never touches the database. The in-memory adapter runs scripted model answers for tests, as today's
`memory-ai.ts` does.

### 4.2 The flow of one turn
`prepare → agent ⇄ tools → act → send`:
- **prepare:** today's reads: the chat, the lead, the trips, the facts the chat keeps, the booking ahead, the ad the
  chat came from, the agency's answers. Plus the chat summary and the messages after it (section 9).
- **agent ⇄ tools:** LangGraph's tool loop. Read tools answer at once. Action tools **stage** what they will do and
  answer "will do: …" (lead).
- **act:** one transaction, as today's `act.ts`. It first checks the turn is still the one to answer: no newer
  customer line, no person took over, the switches are still on. Then it does the booking, the lead's fields, the
  notes, the tasks, the hand-over and the follow-up.
- **send:** the messages, the brochure, the offer card, the payment message and QR, in order, each with its repeat
  token.

**Why stage, with no word checks left (lead):** the act commits money and messages together. If the turn fails
halfway, or the customer writes again mid-turn, nothing half-done goes out: no hold without its message, no QR alone.
This is the second anti-goal.

### 4.3 Model and OpenRouter
- Same as today: the `sales_agent` feature, the `AI_AGENT_MODELS` list on OpenRouter, Gemini Flash-Lite first.
- **Step 0, before anything else (lead):** prove that LangChain's OpenAI-compatible chat model, pointed at OpenRouter,
  sends Gemini 3's thought signatures (`reasoning_details`) back on every tool round. Gemini refuses a tool round
  without them (a 400).
- If it can't, wrap our own OpenRouter adapter (`integrations/src/ai/openrouter.ts`, which already round-trips them)
  as a LangChain chat model, and let LangGraph drive it.

### 4.4 Limits
- **Loop:** LangGraph's default `recursion_limit` (25 steps, about 12 model calls) (owner). **No time cap** on the
  turn: a customer waiting a few minutes is fine (owner).
- `max_tokens` stays 8,000 per call. Each call still counts against the month's AI limit.
- When the limit is hit: a task for the team, and nothing sent (section 11).
- **Concurrency:** the worker runs **5** turns at once, down from 6 (`AT_ONCE`), because the server is small (owner).

## 5. What the model reads

### 5.1 The prompt
- **The owner's prompt, Langfuse `whatsapp-agent/real-agent`**, is the agent's prompt (owner, 2026-11-17). It replaces
  natural's v5. Its placeholders are `{{agency_name}}` and `{{agent_name}}`.
- **Labels (lead):** live turns read label `production`; Try it reads `latest`, so the newest version can be tried
  without moving a label. The built-in fallback text is a copy of the production version, kept in the repo.
- **Version 2 is written** (`2026-11-17-one-whatsapp-agent-prompt.md`): the owner's draft with the edits this design
  needs (buttons, brochures, media tools, the summary, `hand_over` and its reasons) and the lead's suggestions. It goes
  to Langfuse as `whatsapp-agent/real-agent` version 2.
- **Code follows the prompt's hand-over reasons:** today's list plus `b2b`.
- The prompt's "Important Restrictions" carry what the removed word checks did (section 10).

### 5.2 The chat it reads
- **The chat summary first** (section 9).
- **Then every message after the summary's point,** in full, replacing today's window of 40 lines, 14 days and 1,000
  characters a line (owner). A very long single message may still be capped for size (builder's call; high).
- **Nothing hidden:** lines from the earlier system are shown whole, amounts and dates included, under a clear heading
  saying they came from the earlier system and may be wrong (owner). Today's `withoutAmountsAndDates` goes.
- Lines keep who wrote them: the customer, the Team (with the person's name), the AI, or the earlier system.
- **Media lines** carry a short reference the tools take, such as `[voice note m3]` or `[photo m7] caption` (lead). If
  a line was already transcribed or described, that text appears beside it.

## 6. Brochures (owner)
- Each brochure on a trip gets an owner-written **name** and **description** of what it is for, for example "Spiti
  winter, 7 days, Delhi pickup: day-by-day plan and inclusions".
- Today a brochure is an attachment on the package (`PACKAGE_BROCHURE_RECORD_TYPE`) with only a file name. The name
  and description go in a package-owned table keyed by the attachment, edited in the package editor beside each
  brochure (lead).
- The trip sheet lists each brochure by its id, name and description. **`send_brochure(brochure_id)`** sends that file
  (and the trip's photos, up to 3 files in all as today), captioned with the brochure's name. Uploaded PDF names are
  never used (owner).
- The rule "the chat must have named the trip" goes (owner).
- **Resend on request (owner, O1):** the same brochure goes again when the customer asks for it. Unasked, a brochure
  already sent in the chat is not sent again.
- A brochure with no name yet falls back to the trip's title (lead), so nothing breaks before owners fill them in.

## 7. Booking by button (owner)

### 7.1 The customer's side
1. The agent calls `offer_booking`. The act sends the model's line, then an **offer card**:
   - an interactive WhatsApp message whose body code writes from the offer record: trip, date, pickup, people, room,
     total and advance;
   - two buttons: **"Book these seats"** and **"Change something"**.

   Code writes the card's figures (lead), so the customer taps on exactly the terms that will be booked.
2. **They tap Book.** The tap arrives as an inbound event carrying the button's id (`book:<offerId>`). Code books it
   with no model call:
   - the offer must still be live, the seats free and the price unchanged;
   - it holds the seats and creates the AI booking, as `book` does today;
   - it sends a short fixed line in the customer's language, then the payment message and QR.
3. **They tap Change** (`change:<offerId>`). An agent turn runs with a notice: "they want to change something about
   offer X".
4. **They tap a stale offer** (replaced, expired, or seats gone). An agent turn runs with a notice saying what changed
   and the live offer, if any. Nothing is booked.
5. **They type instead** ("haan book karo"). The model judges it and calls `book` as today. `book` keeps its business
   checks (live offer or a total told, seats, price unchanged). It drops the `customer_words` string match (owner:
   string matching goes).
6. **The full name as on the ID** is no longer asked before the hold (lead). The booking takes the lead's or
   WhatsApp's name, and the agent asks for the travellers' names afterwards, as the trip needs them anyway.

### 7.2 WhatsApp and MSG91 work
- **The port:** `WhatsAppProvider` gains `sendButtons(number, to, { body, buttons: [{ id, title }] })`. The MSG91
  adapter and the in-memory adapter implement it.
- **WhatsApp's limits:** up to 3 buttons, a title of 20 characters at most, a body of 1,024 characters. It only works
  inside the 24-hour window, which a live offer always is.
- **The webhook parser** (`parse-msg91-event.ts`) reads a button reply as a new message kind, `button`, carrying the
  button id and the message it answers. The inbox shows it as "Tapped: Book these seats".
- **First, check MSG91's API documentation and a live test number:** that it sends interactive reply buttons, and that
  its webhook returns the tapped button's id. If it can't, stop and tell the owner before building the rest of
  section 7.

## 8. Voice notes and images (owner)
Two new read tools:
- **`transcribe_voice_note(message)`**: the transcript, in the language spoken.
- **`look_at_image(message, question?)`**: what the image shows, or the answer to the question asked.

How they work (lead):
- The worker fetches the file from storage and sends it to a Gemini model that takes audio and images, through
  OpenRouter. The api never streams the bytes.
- The result is saved on the message, so the inbox, the summary and later turns reuse it, and nobody pays for it twice.
- They count against the month's AI limit like any call.
- **Payment screenshots:** when a photo arrives while a booking waits for payment, code still gives the team a
  "check this payment" task (lead). The agent may look at the screenshot and keep chatting, but it never says the
  money arrived (prompt). Today's forced hand-over on every such photo goes (owner accepted, O4).

## 9. The chat summary (owner; more to discuss)
- **A separate component** with its own prompt, Langfuse `whatsapp-agent/chat-summary`. It is not part of the agent's
  turn logic. Its starting text is Appendix A.
- **It stores its point:** the last message it covered (its id and time), the summary text, and when it ran. The
  stored chat state replaces lite's `summary` field.
- **The trigger:** when the messages after the point number **more than 30**, it runs again. It reads the previous
  summary and the messages after the point, writes the summary afresh, and moves the point.
- **What the agent then gets:** the summary, plus only the messages after the point (section 5.2).
- **No raw tail (owner, O2):** the agent reads the summary and the messages after its point, nothing else. A refresh
  covers every message up to the newest, so the summary holds what was last said.
- **When the check runs (lead):** in the agent's prepare step, before the model is called, so a turn never reads a
  window of more than 30 messages.
- **Chats with a lite summary but no point:** the first run treats the lite text as the previous summary (lead).

## 10. What goes: checks on words
- **Removed (owner):**
  - the reply-word guards G1–G5 (`natural/guards/`) and their retries and fallbacks;
  - the `customer_words` match;
  - the "chat must have named the trip" rule.
- **What stays (lead):**
  - the tools' **argument schemas**, which the framework checks itself;
  - the **business checks** inside action tools: the trip is one of the agency's, a date isn't past, the seats and
    the price hold, a value a person set on the lead is never overwritten, the follow-up's time. These are facts about
    the data, not checks on words.
- **If mistakes show up later** in the traces, a model reading the reply is the way back, never string matching
  (owner).

## 11. When things fail
- **A tool's arguments are wrong, or its check refuses:** the tool answers a sentence saying why and what to do
  instead. The model acts on it in the same turn, as today.
- **A lookup fails** (the database): the tool answers "couldn't read that just now; say you'll check, and create a
  task".
- **The model is down:** the job retries twice, after a wait each time. After that, a task holding what they wrote,
  and nothing to the customer (the owner, 2026-11-24: no automatic holding line).
- **The loop limit is hit:** a task, and nothing to the customer.
- **The act refuses a booking** (the seats went, the price changed): nothing is held. The model answers once more
  with the trip's open dates, as `turn-refused.ts` does.
- **Error rates:** each tool call, refusal and fallback is in the Langfuse trace and in `ai_turn_trace`. The owner
  reviews the rates after the first days live (O3).

## 12. Moving over
1. **Now, small (owner):** natural is the default agent for new agencies (`ai_autopilot.agent` default 'natural'),
   and the worker runs 5 turns at once.
2. **Step 0:** the thought-signature test (section 4.3).
3. **The one agent beside the others:** a third value in `ai_autopilot.agent`, chosen per agency in the console, with
   Try it on it first. It ships with today's natural tools, the new history and the removed checks.
4. Then brochures (section 6), media (section 8), buttons (section 7) and the summary (section 9), each its own pull
   request.
5. The owner switches agencies one by one, then makes the one agent the default.
6. **Delete** lite's and natural's code, their prompts, and their columns and values no longer read, in a migration
   that only drops what nothing reads.

## 13. Settled on 2026-11-17
- **O1:** resend the same brochure when asked: yes.
- **O2:** the summary has no raw tail; the check runs in the prepare step.
- **O3:** the error rates are reviewed after the first days live.
- **O4 and the lead's calls** (a tap books without the full ID name; code writes the offer card; actions staged and
  committed together; a payment screenshot gives the team a task): accepted by the owner.

## 14. Left to the builder
- Folder and port names.
- The LangGraph shape (prebuilt ReAct agent or a small `StateGraph`), as long as section 4.2's order holds.
- The brochure table's shape.
- How a media reference is written.
- The size cap on one long message.
- The fixed line sent after a tap-booking.
- How Try it shows a button tap.

## Appendix A: the summary prompt's starting text

The owner will review it in Langfuse once it exists. `{{agency_name}}` is filled in per agency.

```text
# Chat summary for {{agency_name}}

You keep the notes on one WhatsApp chat between a customer and {{agency_name}},
a travel company in India. The sales agent reads your notes instead of the older
messages, so anything you leave out is forgotten. Anything you get wrong, the agent
will repeat to the customer.

You get:
- your previous notes (empty for a new chat);
- every message since those notes, oldest first. Each is marked Customer, Team
  (with the person's name), AI, or Earlier system;
- the lead card as it is now.

Write the notes again in full, keeping everything from the previous notes that is
still true, and adding what the new messages say.

## What to keep
- Who they are: name, city, who's travelling (adults, children's ages), language
  they write in.
- What they want: places and trips asked about, dates or month, budget, room,
  pickup. If they changed their mind, say so: "First asked Kashmir, now Spiti."
- What was sent and told: brochures sent, prices and totals quoted, offers made,
  with the amounts and dates exactly as written.
- Money: booking held, payment screenshot sent, payment confirmed by the Team.
  Write only what a message shows; never assume a payment arrived.
- Files they sent: for each photo or file whose message says seen: "…", what it was,
  under the heading it belongs to: "payment receipt ₹6,000, 25 Nov 2:38 pm",
  "list of travellers' names: A, B, C".
- Promises and open items: what the Team or AI said they'd check or send, and
  questions not answered yet.
- Their worries and objections: price, safety, fitness, family, dates.
- Where it stands: just asking, comparing, ready to book, booked, gone quiet,
  not interested, handed to a person and why.

## Rules
- Only what the messages and the previous notes say. No guessing, no advice.
- Say who said what when it matters: "Team (Rahul) offered ₹500 off" is not the
  same as "AI said the team may give a discount".
- Newest wins: when a detail changed, keep the latest and note the change once.
- An ask answered by a photo or file is answered: never list it under Open items
  because nothing was typed.
- Short lines under the headings below. At most 250 words.
- Plain English, even when the chat is in Hinglish or Hindi; quote the customer's
  own words only when the wording matters.

## Format
Customer:
Wants:
Sent and told:
Money:
Open items:
Worries:
Stands:
```
