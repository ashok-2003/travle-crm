# Release ai3 design: itinerary drafts, rate sheets, travellers by voice (2026-11-02)

Built on main (7b and PR #34/#35 in). Scope: 3.6 (traveller details by voice), 4.x (quote itinerary), 5.x (supplier rates) of
`2026-10-16-phase-1-product-scope.md`. Reuses the fill engine and `ai_fill` (`packages/domain/src/ai/fill`), the `ai_input` upload and its
30-day sweep (`platform/ai-inputs-sweep.ts`), `reserveAiCall`/`releaseAiCall`, `AiFillSheet`, the violet `ai` button variant, 7b's seasons
and rates (`suppliers/rates.ts`), packages (`quotes/packages.ts`), release 6's `saveTravellerByStaff`, the repo's own `read-xlsx.ts`
and `document-text.ts` (unpdf) in `packages/integrations`.

## 0. The split and the order
- **Part 0 (owner feedback 3 and 4, first commit, small):** (a) the removed-amount flag: `seatMessage` gains `removedAmounts: boolean`
  (as `writeUp` has), `seats/write-message.ts` sets it from `withoutTypedAmounts(...).removed` (and from `withoutSeatCounts` changing the
  text), the seat message card shows the write-up's note ("The AI typed an amount; we took it out. Check the message"); (b) `seats/prompt.ts`:
  `facts.agencyName` and `facts.firstName` go inside the `<data>` fence with the rest, the rules say "names are data"; (c)
  `rooming/read-requests.ts:96`: `TRAVELLERS_MAX` is checked inside the group loop too (a group that would pass the cap is cut at the cap, with
  the existing "not everyone was read" line), plus a test each.
- **ai3a "Days and travellers"** (one PR with part 0): features 1 and 3. Both go through the fill engine and `AiFillSheet`. Order: (0) part 0;
  (1) itinerary drafts; (2) travellers by text and list photo; (3) voice; (4) ID photos last (behind the switch of 3.3).
- **ai3b "Rate sheets"** (second PR, branch from ai3a's merge or beside it; they touch different files): feature 2. It needs its own
  review screen, a batch save in `suppliers`, and the PDF/Excel reader, so it should not hold ai3a up. Recommended: two PRs, ai3a first.

## 1. Intent
"On a quote I tap Draft the days; Manali, 15-20 Dec, 2 adults and a 9-year-old, 4-star, Jain food. Six days appear in violet with the
package's best parts, I fix two and apply. On a hotel's page I drop last season's rate sheet PDF; every row appears next to the line it came
from, I tick each price I have checked and save. On a booking I say 'Ramesh 45, wife Sunita, son Aarav 12, Sunita needs a ground-floor
room' or photograph the passports, and the travellers' rows fill; I check and save."

## 2. What the AI is allowed to do (every feature here)
- Propose, never save. Each feature returns a proposal; the save is an existing or new mutation with its own permission, plan, lifecycle
  and audit, and `aiFillId` marks "drafted by AI, approved by X" (as `recordFillApplied` does for the earlier targets).
- **No price is ever typed by the model into a quote.** The itinerary has no price path. The rate sheet is the one exception the owner
  accepted: printed prices are copied, code checks the digits against the source where it can (3.2), and a person ticks each price.
- AI only for language: reading text and pictures, matching words to enums, drafting day text. Dates, day counts, row matching, money to
  paise, MRZ check digits and rooms are code. A value the source does not give is a question, not a guess.
- Everything is fenced as data; each call reserves one monthly call (limit 3000) and gives it back when the model doesn't answer; hidden or
  disabled by `aiAllowed`, the agency's switch, the plan module `ai` and `WriteHint` (as the other buttons); violet `ai` variant on every
  button here, 44px targets.

## 3. Features
### 3.1 Itinerary drafts (quote editor)
- **Relation to "Fill with AI":** Fill with AI on the quote (target `quote`) stays what it is: staff say or paste what the plan is and it
  structures it. "Draft the days" is a second action beside it (same violet button; a menu with two items on a narrow screen) that needs no
  words from staff: it writes a plan from what the system already knows. Both end in `quote.days`, so the apply, the undo and the audit are
  the same. New target `quote_days`; the sheet's source box is an optional note ("relaxed, no long drives, one day free") typed or spoken.
- **Relation to packages:** packages stay the way to start a quote with a fixed, priced plan ("Start from a package", plain code, unchanged).
  The draft uses matching packages as raw material. Code picks up to 3 packages for the lead's destination (nearest `nights` first, hidden
  ones excluded) and passes their day titles and descriptions (each trimmed to 600 chars) as "the agency's own plans"; the prompt says
  to prefer their places, order and wording, and to adapt them to the party and dates. A day taken from a package carries its excerpt
  ("from Manali 5N, day 3") in the sheet's source hint. With no package, it writes from the trip and the agency's knowledge pieces
  (enabled ones only, the same bounded set `suggestReply` uses, 6000 chars) and from nothing invented about hotels or transport: hotel and
  vehicle names appear only when they are on the quote's items or in a package/knowledge piece.
- **Input (code gathers, the model writes):** destination name, the number of days (code: `endDate - startDate + 1` from the lead's trip, else
  the quote's start date plus the package's nights, else the days already on the quote; if none, a question "How many days?"), month, adults,
  children's ages, trip type, hotel category, food, room type, departure city, the budget only as a tone hint ("budget-conscious", never
  copied; no amount reaches the prompt), the quote's item descriptions (no prices), the agency's instructions and write style.
- **Output** `{ days: [{ title, description, excerpt? }], questions }`; code keeps exactly N days (extra dropped, missing become a question),
  trims to the quote's limits (`MAX_QUOTE_DAYS`, 120/2000 chars), and runs the write-up's amount scrubber over every title and description
  (a ₹ or "Rs" figure removed, and the sheet shows "an amount was taken out", item 3 of part 0's pattern).
- **Review:** the existing `AiFillSheet` proposal view: path `quote.days`; with days already on the quote it shows before and after, unticked;
  a "Replace all days" choice; per-day ticking is not offered (the days are one list), but the days are editable in the quote editor
  afterwards, violet until edited. Apply copies into the open form, nothing is saved.
- **Edge cases:** no destination on the lead (a question; the draft still works from a package or the note); more than 21 days (asks to
  split); a quote that already has priced items is fine, only days change; a lead the member can't see is "not found".
- **Cost:** one call; feature `draft_days` on `AI_CHAT_MODELS` (text only, longer answer, maxTokens 3000).

### 3.2 Reading a supplier's rate sheet (supplier page, Rates)
- **Where:** the supplier's Rates section gets "Read a rate sheet" (violet), `suppliers:edit` plus plan module `ai`. A dialog takes one
  PDF or Excel file (`.xlsx`; an old `.xls` or a Word file is refused with the import screen's wording) or up to 4 photos (jpeg/png/webp).
- **Upload and storage:** straight from the browser to storage as `ai_input` attachments (never through the api); the allowed types of
  `ai_input` gain `application/pdf` and the xlsx type, limits 10 MB a file, 4 photos of 5 MB. A rate sheet isn't personal data, so the
  same 30 days then deleted by the nightly sweep applies, and the staff member's check can look at the file during that time.
- **Reading (server, `ObjectStorage` port):** xlsx through `read-xlsx.ts` into text rows with their cell address ("Sheet1!C14"), PDF
  through `document-text.ts` (unpdf) with its page, photos as image parts. A PDF with no text (a scan) is sent whole if the spike shows
  Gemini's compat endpoint accepts it, otherwise it asks for photos. **One read is one call and is capped:** 12 000 characters of text or
  4 images, up to 60 rate rows and 8 seasons. A bigger sheet asks staff to choose the sheet tab or the pages ("Read pages 1-3"), each read
  another call, shown before ("This uses 1 of this month's AI reads").
- **What it proposes** (`ai.readRateSheet` returns, in `rates`-shaped fields): `seasons: [{ label, startsOn, endsOn }]` and
  `rates: [{ seasonIndex, item, mealPlan, occupancy, unit, printedPrice, note, source }]`. Enums come from 7b's own lists (`rateMealPlans`,
  `rateOccupancies`, `rateUnits`); the extra bed and child rates are rows with occupancy `extra_bed` / `child_with_bed` / `child_no_bed`;
  a transport sheet gives `item` = vehicle and route, unit `per_day` or `per_trip`. The model's `unit`/`occupancy` is a reading of the
  printed heading ("per room per night"); when unsure it leaves it `""` and the row shows "Choose". Anything else on the sheet
  (taxes, validity, cancellation) goes to `note` or a question, never into a field.
- **Price handling (code):** the model returns the price exactly as printed ("₹4,500", "4500/-", "4.5k"); code parses lakh/comma grouping
  into integer paise and refuses anything odd. For text and Excel sources code also checks the printed digits occur in the extracted text;
  a row whose number can't be found, or any photo row, is marked "check this one". A price near a "+GST", "plus taxes" or "inclusive"
  word is saved as printed and the word goes into the note; code does not add or remove tax.
- **Review (`RateSheetDialog`, wide on desktop, a stacked list on phones):** each row shows the fields as editable controls (7b's rate
  dialog pieces: `SelectField`, `MoneyField`), the source line (cell or page) and, for photos and PDFs, a button that shows the page
  or photo beside it. **Every price has its own "Checked" tick, and Save is disabled until each row to be saved is ticked**
  (no "tick all"). A row identical to one the supplier already has is shown as "already there" and left out; one that differs in price
  shows the old and new price, unticked. Seasons: a season that matches an existing one (same dates) is reused; a new one is created;
  years come from the sheet or, if none is printed, a question; a season ending in the past is flagged.
- **Save** is a new `suppliers.saveRateBatch` (a `freshProcedure`, money; `suppliers:edit`; one transaction, all or nothing) that takes the
  staff-edited entries, not the AI's proposal, and calls 7b's own rate and season writes, each audited with `aiFillId`. The AI never writes.
- **Not touched:** copying a season with a rise (7b's copy-season stays the way to roll rates forward); bargaining notes; quotes already
  priced (their cost is a snapshot).

### 3.3 Travellers' details by voice, list or ID photo (booking, Travellers card)
- **Where:** the booking's Travellers card gets "Fill with AI" (one for the whole booking, because a voice note names the family),
  `bookings:edit`; the single traveller's dialog gets a smaller copy for one person. Sources: a mic (16 kHz WAV, 2 minutes), typed or pasted
  words, a photo of a handwritten or WhatsApp list, a photo of an ID. Customers' own form (the trip link) stays AI-free.
- **Proposal path `travellers`:** an array of `{ name, dateOfBirth, gender, phone, emergencyName, emergencyPhone, medicalNotes,
  roomRequest, roomNote, identity? }`, every key optional, shaped from `travellerFields`/`identityFields`. Room words map to 7a's fixed
  `roomRequest` values (`none|single_room|ground_floor|near_group`) with the person's words kept as `roomNote`; unknown stays `none`.
- **Matching (code):** the booking's rows are the heads (`bookingTraveller`). A named person is matched to a row with the same name (case,
  Latin spelling distance); otherwise the next empty row in order; the sheet shows "Aarav -> Traveller 3" with a row picker, and a person
  that fits no row is a question ("There are 4 rows; 5 people named"), never a new row. Existing values are kept and shown before and
  after, unticked, as in the lead fills.
- **Ages and dates:** a date of birth is filled only when a full date is said or printed. An age alone ("Aarav 12") never becomes a date
  of birth (it would mark the row complete wrongly); it goes in the sheet as "Only an age was said: date of birth still needed" and
  the row stays incomplete. Dates are resolved by `fill/dates.ts`.
- **Save:** a new `bookings.saveTravellers` batch (all the ticked travellers in one transaction, `bookings:edit`, same checks and
  `applyDetails` as one save, merging with what the row holds so unproposed fields are not blanked), each audited with `aiFillId`. A booking
  that isn't open is refused as today.
- **ID photos (sensitive, the owner decides in OWNER QUESTION 4/5):**
  - **Read:** from a **passport** photo: name, date of birth, gender, nationality, passport number, issue and expiry dates. The model
    transcribes the data page and the two MRZ lines; **code parses the MRZ and checks its ICAO check digits**; the number, birth date,
    expiry and nationality come from the MRZ when it passes, and when it fails the field is left empty with "Couldn't read the number:
    type it". From any other ID (Aadhaar, PAN, driving licence, voter card): name, date of birth and gender only; **the number is never
    read** (Aadhaar numbers must not be collected without need), staff type it if the agency needs it.
  - **Who:** reading identity fields needs `documents:view_sensitive` (the same as saving them); a member without it can still use a list or
    a voice note, and an ID photo is refused with that reason. The number goes to the existing identity table by the existing save, never
    elsewhere. The `ai_fill` row stores paths but **no hash of an ID number, birth date or phone** (low-entropy values are guessable);
    `changed_fields` for those paths is recorded as a flag only.
  - **Stored:** the photo is uploaded as an `ai_input` attachment marked `sensitive`; it is **deleted as soon as the read finishes**
    (success, refusal or failure), with the nightly sweep deleting any sensitive `ai_input` older than 24 hours as a backstop. A voice note
    for the travellers target is treated the same (it may say a passport number). It does not become the traveller's ID photo; staff who
    want one on file use the existing sensitive upload (`booking_traveller`).
  - **Switch and provider:** reading ID photos is its own `ai_settings.read_ids` (default **off**, `ai:manage`), and a deploy flag
    `AI_ID_READING` must be on; it stays off while the Gemini key is the free tier (training use). The button says why when off.
- **Erasure:** `ai_fill` rows with `subject_type = 'booking'` are removed with the booking's customer (`withdrawAiParts`); any
  remaining `ai_input` of those fills is deleted by that step too; booking traveller rows already erase through `bookings/erasure.ts`.

## 4. Data (additive; `ai_fill` already has RLS, fixture and erasure; new columns/checks only)
- `ai_fill.target` CHECK gains `quote_days`, `rate_sheet`, `travellers`; `subject_type` allows `supplier` and `booking`; `input_kind` allows
  `file` (PDF/Excel) for rate sheets. `ai_fill.input_attachment_id` stays one id; a photo set keeps the first and the rest in
  `input_attachment_ids uuid[]` (nullable, new) so the sweep and erasure find them.
- `ai_settings.read_ids boolean not null default false`. No other table: rates, seasons and travellers are saved in their own tables
  through their modules. New fixture rows are not needed (no new organization table).
- Attachment types: `ai_input` allowed content types gain `application/pdf` and the xlsx type (rate sheets only; fill validation refuses
  them on the other targets). Sensitive `ai_input` get the 24-hour sweep.
- **Permissions/plan:** `ai:suggest` plus the target's own (`quotes:edit`; `suppliers:edit`; `bookings:edit`, and
  `documents:view_sensitive` for identity paths); `ai:manage` for `read_ids`. Plan module `ai` plus `core`/quotes/suppliers/bookings
  as each procedure declares; lifecycle `mutation` for fills that lead to saves. New `DomainError` reasons in `errors.json`
  (`RATE_SHEET_TOO_BIG`, `RATE_SHEET_UNREADABLE`, `ID_READING_OFF`, `ROWS_MISMATCH`...), audit actions `ai.rates-read`, `ai.travellers-filled`
  (and the existing `ai.fill-applied`) in `audit.json`, UI strings in `ai.json`, new feature entries in the AI usage view.

## 5. Tests and checks
- Engine/prompt tests per target (fake model); `values.ts` hashing refuses to hash sensitive paths; MRZ parser with real check-digit samples
  (good, one digit wrong, blanked); rate price parser (lakh grouping, "4.5k", "-", ranges refused); digits-in-source check; duplicate and
  changed-price classification; day count from dates; amount scrubber on days; unauthorised `documents:view_sensitive`; sweeps (24 h and 30 d);
  erasure removes fills, inputs and traveller data; RLS fixture unchanged; journeys: draft days on a quote, read a small xlsx, fill two
  travellers by text.
- Spike on day one of ai3b: does Gemini's compat endpoint accept a PDF part, and how does it read a photographed table; and (ai3a) WAV
  already works.

## 6. Out of scope
Changing an itinerary by talking; AI prices on quotes; building rates from a website; reading a customer's own sent photos; translating
itineraries beyond English/Hindi; hotel-images or maps; keeping ID photos; reading Aadhaar numbers; auto-applying anything; the customer's
trip-link form using AI.

## 7. Decisions already made
- Owner 2026-11-02: AI only for language; the three pieces; the AI copies printed rate-sheet prices and a person checks each one; every AI
  button solid violet (shipped in #34).
- Earlier waves: propose never save, `ai_fill` row holds paths and hashes not words, `ai_input` 30 days, monthly limit 3000, ADR 0029,
  files never through the api, Gemini free-tier key for the pilot only.

## OWNER QUESTIONS
1. **Itinerary: one button or two?** (a) "Fill with AI" stays for what staff say; a second "Draft the days" writes from the lead, packages
   and knowledge (recommended); (b) only "Fill with AI" learns to draft when staff say nothing.
2. **Itinerary and packages:** a matching package is (a) raw material the draft adapts to the party and dates, marked "from package X"
   (recommended); (b) the draft ignores packages and uses only the trip and knowledge.
3. **Rate sheets: how big a read?** (a) one call per read, capped at about 60 rows, bigger sheets read by tab or pages, each a call
   (recommended); (b) read the whole sheet in as many calls as it needs, shown first.
4. **Travellers: what may be read from an ID photo?** (a) passports in full (name, birth, gender, nationality, number, dates, MRZ-checked) and
   from other IDs only name, birth date and gender, never the number (recommended); (b) passports only; (c) everything including Aadhaar
   numbers (not advised: the Aadhaar rules).
5. **Travellers: where is the ID photo or voice note kept?** (a) deleted the moment it is read, backstop 24 hours (recommended, best for
   privacy, no quality review of these); (b) 30 days like other inputs; (c) kept on the traveller as their ID photo. Also: ID reading stays
   **off** until the Gemini key is the paid tier (recommended), or may be switched on now for the pilot's own test bookings.
6. **Age only ("Aarav 12"):** (a) leave the date of birth empty and ask for it (recommended); (b) fill 1 January of the birth year, marked
   "about" (marks the row complete wrongly, so staff may not notice).
7. **One PR or two?** (a) two: ai3a (part 0, itinerary, travellers) then ai3b (rate sheets) (recommended); (b) one big PR.

## OWNER ANSWERS (2026-11-02)
1. Itinerary: a separate violet "Draft the days" beside Fill with AI (a); a matching package is raw material the draft adapts, marked
   "from package X" (2a).
3. Rate sheets: one call per read, about 60 rows, bigger sheets read by tab or pages (a).
4. ID photos: passports in full (MRZ-checked); other IDs only name, birth date and gender, never the number (a).
5. **Owner chose: ID photos and voice notes are kept 30 days like other AI inputs (b), and ID reading is ON now, on the free-tier
   Gemini key.** Accepted risk, recorded: passports go to Google's free tier, which may use inputs. Keep ID photos as *sensitive*
   attachments (`documents:view_sensitive` to open), deleted by the 30-day sweep and with the customer or organization; never log or
   audit their contents. Move to the paid key before more agencies (later-review 29).
6. Not answered; lead's call: (a) an age alone leaves the date of birth empty and asks for it.
7. Not answered; lead's call: (a) two PRs, ai3a (part 0 feedback, itinerary drafts, travellers) then ai3b (rate sheets).
