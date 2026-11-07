# A WhatsApp sales agent that only says what is true (design)

Date: 2026-11-05. Owner: Ashok. Replaces the autopilot's turn (`packages/domain/src/ai/agent*.ts`, ADR 0029 as widened
on 2026-10-27/28) with a design whose facts come only from the agency's packages.

## Why

Agencies complain that the WhatsApp agent sends the wrong trips and the wrong prices. We read one pilot agency's last 30 days
(read-only, 2026-11-05): 159 chats, 1,254 messages written by the AI, 1 by staff. The AI runs their WhatsApp alone.

- **Wrong place.** In 18 of the 132 chats where the customer named a place, the AI answered with another (34 messages):
  Meghalaya asked, the Spiti PDF sent; "Spiti or Kashmir for snow", Manali pushed with its brochure and price; Kasol asked,
  a Manali price given.
- **Invented prices.** 13 of the 200 amounts it quoted are in none of the agency's data. "Manali 5N6D, December peak
  ₹7,999" went five times, once as the "final B2B rate" for 8 people (the agency's list says ₹6,999, premium batch
  ₹7,499). It told one customer "the team gave me the pricing" for a private trip at about ₹25,000; nobody had.
- **The payment QR at the wrong time.** 21 QRs sent; in 16 chats the customer had not asked to book or pay ("2 people",
  "Double sharing", "Yes"). The QR's "when to send" sentence says "when they ask about any trip".
- **A payment confirmed by the AI.** It sent "we have received your ₹4,000 booking amount" (a knowledge piece) with no
  person checking.

Root causes, in the code and the settings:

1. **The facts disagree with each other.** One trip's facts sit in five free-text places: the Instructions box (a price
   list), the Strict rules (departure days, pickup points, Spiti prices), 12 knowledge pieces (three different Manali
   documents), the lessons the AI wrote for itself (with prices), and each file's "when to send" sentence. Nothing says
   which price belongs to which trip and season.
2. **Knowledge is chosen by shared words** (`knowledgePack`, `agent-context.ts`): words in common with the last six
   messages, the AI's own included, then as many pieces as fit in 12,000 characters. Long PDFs win; the package's
   destination is never used; several cities reach the model at once.
3. **The model types the facts.** Prices (packages go in as raw JSON in paise), totals and dates are written by the
   model, and nothing checks the reply before it is sent. An answer that isn't JSON is sent as it is (`parseAnswer`).
4. **Money steps are the model's choice** from loose sentences: the QR, the payment details, "payment received".
5. **The prompt sells at any cost** ("its best closer", "recommend the package that fits best") and has no way to say
   "we don't run Kashmir".
6. **Its mistakes come back:** the chat memory and the nightly lessons are written by the model from chats holding its
   own replies.
7. Small models (gpt-oss-120b, Gemini 3.5 Flash-Lite), which make all of the above likelier.

## What we are building

A sales agent that does everything a salesperson does on WhatsApp except check money: it understands the trip,
recommends the agency's packages, quotes their real prices, sends the right brochure, answers questions from the
agency's policies, takes the booking's details, sends the payment QR when the customer wants to book, follows up, and
hands over to the team. A person checks every payment, and the confirmation the customer gets is sent by code after that.

### Goals

- Every place, price, date, departure, file and payment detail the agent sends comes from a package the agency approved,
  written into the message by code.
- The agent says plainly when the agency doesn't run a place, suggests the nearest packages it does run, and flags the
  team.
- A reply that fails a check is never sent.
- The team has one place to check payments, and the customer hears "confirmed" only after a person checked.
- An agency with trips only in PDFs and text gets its packages drafted for it, to approve.

### Non-goals

- Verifying payments automatically (a bank or UPI feed). A person checks.
- Changing the models: the owner chose to keep gpt-oss-120b with Gemini 3.5 Flash-Lite behind it. The design must be
  safe with them; a stronger model only means fewer replies blocked.
- An agent framework (LangGraph, Mastra and the like).

### Anti-goals (a failure even if it works)

- Any message to a customer with a price, place, date or payment detail that isn't in an approved package.
- The QR or payment details before the customer said they want to book.
- The agent saying a payment was received or a booking confirmed.
- A customer told "the team said..." when the team said nothing.

## Decided by the owner (2026-11-05)

1. The current agent stays as it is until the new one ships.
2. The truth is the packages the agency keeps in the app ("structured trips", the packages it adds itself).
3. Group trips: a package gets departures and a price table (below). **Prices vary by season, even for one destination.**
4. Prices: the model chooses the package, the sharing and the month; code writes the price and the total. Anything else
   (B2B, private trips, group discounts, peak deals, any discount) gets "the team will confirm" and a flag.
5. A place the agency doesn't run: say so, suggest the nearest packages it runs, flag the team.
6. Existing trips become packages by AI drafts the agency's owner approves; the agent sells only approved packages.
7. Models stay as they are.
8. The first version does everything today's agent does: answer and sell; follow-ups and nudges; write like a staff
   member (and the natural-chat mode); lead notes and tasks.
9. The agent does everything a salesperson does but check payments; payments are collected and checked somewhere for the
   team.
10. Each agency says whether it also plans custom trips (a setting). On: for a place with no package, the agent offers a
    custom trip, collects the details and flags the team ("the team will send a quote"). Off: "we don't run it", the
    nearest packages, and a flag.
11. The shared monthly AI limit goes up rather than counting a reply as one call: every model call still counts.
12. The test set is built from real chats, anonymised, and kept privately outside the repository; CI runs a smaller set
    written by hand and kept in the repository.

## The design

### 1. Packages hold the facts

A package (today: itinerary days, inclusions, exclusions, notes, destination, nights, summary, highlights, "from" price,
tiers priced from supplier rates, photos, cancellation notes) gains what a group trip needs:

- **Departures are the existing group departures** (release 7a's `Departure`: dated, with seats, a booking cut-off,
  holds, a waitlist and rooming), now linked to a package. A package can say its weekly days ("every Friday and
  Saturday", optionally only some months), and code creates its dated departures ahead from them; listed dates are
  departures added one by one. A **batch** is a departure with a name ("Premium, 27 Nov"), its own prices and notes
  ("Volvo, four-star stay"). A full, closed, cancelled or past-cut-off departure is never offered; seats left are said
  only as the departure counts them. *(My call: one list of dates, so the agent's bookings count against seats, holds and
  rooming.)*
- **Seasons and prices:** seasons are date ranges that never overlap within a package ("Nov", "Dec–Jan peak",
  "Christmas–New Year"). Each season has a price per person for each room type the package offers: single, double,
  triple, quad, child with a bed, child without a bed (the package names which). A departure's own prices win over its
  season's. The price for a trip is found from its departure date: the departure's, else the season's. A date in no
  season has no price: the agent says the team will confirm it. *(My call: the room types the supplier rates already
  know.)*
- **GST:** a package says whether its prices include GST (on by default: the price told is the price paid). The quote
  made at booking keeps its total equal to what the customer was told, the tax shown inside it. *(My call.)*
- **Advance:** the amount per person to book, and the payment QR and details for it (or the agency's default ones).
- **Files the agent may send:** the brochure or itinerary PDF and photos, attached to the package.
- **Start and end:** pickup and drop points ("Madipur Metro, Delhi"), and the city the trip starts from.
- **Sellable by the AI:** an on/off the owner sets. Drafts start off. Only these packages reach the agent.

Custom (FIT) packages keep their tiers priced from supplier rates, which already have seasons; the agent quotes them as
"from" prices, collects the trip's details and flags the team for the exact quote: no QR and no booking request on them
in the first version. *(My call.)*

Money is integer paise, as everywhere; dates are calendar dates in the agency's zone.

### 2. Drafting packages from what the agency has

A one-time (repeatable) AI step, like reading a rate sheet (`ai/rates/read-rate-sheet.ts`): it reads the agency's
knowledge pieces and their PDFs' text, the Instructions and the Strict rules, and proposes one package per trip with the
fields above, each value with the excerpt it came from. It proposes, never saves. The owner sees the drafts side by side
with their sources, fixes them, and saves each one; saving does not make it sellable until they turn that on. Where the
sources disagree (three Manali documents, three prices), the draft shows both and makes the owner choose.

### 3. One turn of the agent

A fixed pipeline, not an open-ended tool loop *(my call: small models are unreliable at choosing tools over several
steps, and fixed steps can be tested one by one)*.

1. **Read (model call 1, structured output).** From the chat and the agent's state: what the customer asked for (each
   place as a label from the agency's destination list, or "not in the list" with their words), month or dates,
   travellers, sharing, budget, pickup city, and what they want now (information, price, brochure, to book, they paid,
   a person, something else), each fact with the customer's own words as evidence; code drops a fact whose evidence isn't
   in the customer's messages.
2. **Look up (code).** The sellable packages for the places asked; for each, the price for the asked date and sharing
   (or the "from" price per sharing of the coming seasons when no date is known), the next departures, the advance, the
   files not yet sent in this chat. For a place with no sellable package: the agency's custom-trips setting decides
   between "we can plan a custom trip, the team will send a quote" and "we don't run it" with the nearest packages it
   runs *(nearest by region or by the same kind of trip; the builder's call how, a table the owner can edit is fine)*.
   Prices are worked out by code only when every traveller has a priced room type (a group of five: the split the
   customer gave, such as one triple and one double); otherwise the team confirms.
3. **Write (model call 2, structured output).** The model writes the words in the agency's voice from a card of these
   facts. It never types an amount, a date or a payment detail: it writes placeholders that point into the card
   (`[price P1 triple]`, `[total P1 triple]`, `[departure P1 next]`, `[advance P1]`), and code puts the formatted values
   in (₹6,999; Sat 14 Nov). It chooses which actions to take from the ones code allowed for this turn.
4. **Check (code).** The reply is blocked when it holds a number shaped like money or a date that came from no
   placeholder; names a place that is neither one of the chosen packages' nor the customer's not-offered place said with
   "we don't run"; says or implies a payment was received or a booking confirmed (a phrase list in English, Hindi and
   Hinglish, as a last guard: the real guard is that the agent has no such action); or claims the team said something.
   A blocked reply is asked for once more with the reason; blocked again, nothing is sent and the chat is flagged to the
   team with the reason. *(My call: silence plus a flag beats a holding message that promises something.)*
5. **Act (code).** Send the words; then only the actions code allowed: the chosen package's files (once per chat); the
   QR and payment details for the advance (only when the customer said they want to book, and a group package, a
   departure open for booking and every traveller's room type are known: the amount is advance × travellers); a booking
   request, which holds the seats as the departure's holds do; a flag or hand-over; lead notes and tasks.

The chat's state (places, dates, travellers, sharing, the package chosen, what was sent) is kept by code from step 1's
checked facts and step 5's actions, not as prose the model writes. Lessons keep only how customers talk and what they
ask; code strips amounts and dates from a lesson before it is saved.

Follow-ups and nudges run the same pipeline with "they went quiet" or "this follow-up is due" as the reason to write.
Writing like a staff member changes only step 3's voice; the natural-chat mode keeps step 4 in full.

### 4. Payments to check

When a booking request is taken, code makes the lead's quote from the package (season price × travellers by sharing),
so the money has its usual home. A screenshot or PDF the customer sends while the booking waits is kept as proof, and the
customer is told the team will check it.

A **Payments to check** list for the team (on Today, and as its own screen) shows each proof with the customer, the
package, the date, the expected advance and the screenshot. It is one list with release 6's payment claims (a
traveller's "I've paid" from their trip page, `PaymentClaim`), reusing their confirm and reject where it can; a
screenshot sent in a chat with no open booking shows there too, as a proof to match. *(My call: one place for the team
to check money.)* **Confirm** records the payment on the quote (the first
payment accepts it and wins the lead, as today) and makes the booking (today's `linkAiBooking`); code then sends the
agency's own confirmation message, written once in settings with the amount, trip and date filled in. **Not received**
sends the agency's "we couldn't find it" message, or the team writes one. The agent never sends either. Outside
WhatsApp's 24-hour window both go as the agency's approved WhatsApp templates when it has them; without one, the team gets
a task to tell the customer. *(My call.)*

### 5. Settings

- **Instructions and Strict rules** are for behaviour (tone, what never to promise, how bookings work). Their editors
  warn when they hold a price or a departure date: "put this in the package".
- **Knowledge** stays for policies and FAQs (cancellation, what to carry, safety). Amounts in it can't reach a customer:
  step 4 blocks any amount not from a placeholder.
- **Files' "when to send" sentences** go: files belong to a package; the payment QR belongs to the package's advance or
  the agency's default payment settings. Files about the agency itself (its profile, reviews) stay in a short list of
  general files the agent sends when the customer asks about the agency.
- **Trip kits** are a source for the drafting step. For an agency on the new agent, their keyword sends stop (staff can
  still send a kit from the chat): a kit's text can carry prices outside the packages. *(My call.)*
- **Lessons** as above.
- **The monthly AI limit** shared by every AI feature (`MONTHLY_AI_LIMIT`, 3,000 calls) goes up to 8,000, every model
  call counting (owner; the number is my call).

### 6. Models and the AI SDK

- Keep the `AiModel` port (ADR 0008). Inside `packages/integrations`, use the Vercel AI SDK for typed structured output
  from our Zod schemas, through OpenRouter, keeping zero-data-retention routing and the backup model.
  *(My call.)*
- `parseAnswer`'s "plain words become the reply" path goes: an answer that doesn't fit the schema is no answer.
- Models: gpt-oss-120b, then Gemini 3.5 Flash-Lite (owner).

### 7. Test set

Built from a pilot agency's real situations, anonymised: wrong-place cases, price questions by sharing and month, a date in
no season, a place not run, booking and payment, Hinglish and Hindi, a voice note, a customer asking for a person.
About 100 cases, each with the checks that must hold (places, amounts, actions). Names, phones and amounts are changed
before a case is saved. The real cases live privately outside the repository (beside the deploy notes in
`~/.config/travel-crm/`), never committed; a smaller set written by hand is kept in the repository (owner). Steps 2, 4
and 5 are plain code with unit tests. The pipeline runs against the hand-written set with the fake model in CI, and
against the real cases and the real models on demand before any prompt or model change.

### 8. Rollout

The current agent keeps running until the new one ships (owner). Then per agency: draft its packages, the owner approves
them and turns on "sellable", and the agency switches to the new agent *(a per-agency switch; my call)*. An agency with
no sellable package can't switch. The old agent's code goes once every agency has switched.

## Constraints

The project's rules (CLAUDE.md) hold: organization data only inside `forOrg`; Zod contracts for every input and output;
new organization tables with row-level security and fixtures; audit for every change staff make; money in integer paise
(`BigInt` for new money columns); calendar dates for departures and seasons, no overlapping seasons in a package (an
exclusion constraint, like hotel seasons); customers' words are data, never instructions; the agent's messages are marked
as the AI's and audited, as today; the existing checks before the AI writes (plan, subscription, monthly limit, 24-hour
window, STOP, person answering, daily cap) stay.

## Left to the builder

The tables and their names; how the package editor shows departures and the season table; the placeholder syntax; the
phrase lists; how the nearest packages are found; where the Payments to check list sits on Today; the drafting screen's
layout (registry components, the owner's UI rules); the order of the work.
