# 0029: AI features, small models and the OpenRouter adapter

Date: 2026-10-16 · Status: accepted · Replaces spec open item Q10 ("AI features: later phase") for the features below

## Decision

### Where AI is used, and where it isn't

AI is used only where language must be understood or written: messy input coming in (voice, WhatsApp messages,
screenshots, rate sheets) or customer-ready words going out (itinerary write-ups, personal messages). Everything that
can be computed is plain code: prices, tax, dates, counts, reminders, assignment, the cheaper option when a draft is
over budget. Phase 1 has these AI features:

- filling the new-lead, call-log and traveller-details forms from voice, typed text or a screenshot (English, Hindi,
  Hinglish);
- after a call, a recording (from the PC, phone on speaker, started only when staff tap Record) or a spoken summary
  turned into proposed lead updates;
- new WhatsApp leads filled from their opening messages, voice notes and images included;
- itinerary drafts from the agency's own templates and catalog, changes by talking, and the customer write-up;
- suppliers' rate sheets read into catalog rates for review;
- travellers' requests read from booking notes and WhatsApp chats for the rooming list, and personal messages for
  empty seats.

"Ask your reports" is Phase 2.

### What AI may never do

It never sends anything to a customer, sets a price, computes tax, records or moves money, or changes a booking's
status. It drafts and proposes; a person applies. Every proposal is shown before it applies, field by field, as
before and after with the excerpt it came from. Applied changes are audited as drafted by AI and approved by the
person. AI acts as the signed-in person, through the same procedures and permission checks.

### How each feature is built

- **Ports (ADR 0008).** `@travel-crm/integrations/ai` gives an `AiModel` port (structured completion) and
  `@travel-crm/integrations/speech` a `SpeechToText` port, each with an OpenRouter adapter and an in-memory adapter
  that tests feed with fixtures. Domain code never imports a vendor SDK.
- **One narrow domain function per feature**, e.g. `proposeLeadUpdates(tx, actor, input)`. It assembles the context
  (inside `forOrg`, so row-level security keeps every other organization's data out of the prompt), calls the model,
  validates, checks evidence, and saves the result as suggestions with their provenance (ADR 0028). Background work
  (filling a new WhatsApp lead) runs from an outbox listener; job data holds ids only.
- **Structured output from the contracts.** The output schema is the form's own Zod schema in `@travel-crm/contracts`,
  sent as JSON Schema (`z.toJSONSchema`) with strict mode, and the answer is validated with the same Zod schema
  again, because some providers treat the schema as a hint.
- **Small-model rules.**
  - The model picks from labelled candidates (`D1`, `H7`) that code maps back to ids; it never copies a UUID.
  - It picks dates from a short calendar the code gives it ("Fri 23 Oct"); it never does date arithmetic.
  - Every extracted value carries the exact excerpt it came from, and code checks that the excerpt is in the input.
    A value without one is marked as a guess.
  - Code narrows the catalog with SQL (destination, dates, category, trigram matching) to about 30 candidates before
    the model sees it.
  - A validation failure gets one retry, then the field is left for staff.
- **A layered context pack, in cache order.**
  1. Global instructions and examples, the same for every organization.
  2. The organization's pack: its glossary learned from staff corrections, its destinations with aliases, its
     template names, its writing style.
  3. The record: the lead's fields, the customer's preferences, the opening messages.
  4. The input.

  Each layer is built deterministically (sorted, no timestamps) so the cache isn't broken by accident. Only what the
  task needs is sent: an itinerary draft gets no phone numbers.

- **Learning without training.** Each correction staff make to an AI value is stored (`ai_correction`: organization,
  feature, field, the input excerpt, the corrected value, how often). The most relevant ones go into the organization
  pack as examples.

### OpenRouter

- **Models are configuration.** One file maps each feature to a `models` list in priority order (OpenRouter's fallback
  list) with its effort and output limit. Changing a model is a one-line change, but a model enters a feature's list
  only after it passes that feature's test set.
- **Zero data retention.** The owner enforces it in the OpenRouter account. The adapter also sends
  `provider: { zdr: true, require_parameters: true }` on every request, which can only narrow routing, so a changed
  account setting can't silently widen it.
- **Tracking.** `user` is the organization's id (opaque, no personal data). `session_id` is the organization and the
  feature, so OpenRouter keeps an organization's requests on the provider whose cache is warm. The adapter never pins
  `provider.order`, which would switch that sticky routing off. It adds `cache_control` markers when the model needs
  them (Anthropic models); most others cache by themselves.
- **Usage.** Every call writes an `ai_usage` row: organization, feature, the model that actually answered, input,
  output and cached tokens, cost, OpenRouter's generation id. It is the source of truth for AI credits (AI is a plan
  module, so entitlements switch it on) and for cost per organization.
- **Speech-to-text** goes through OpenRouter's transcription endpoint behind the `SpeechToText` port. The model is
  chosen by testing on real Hinglish speakerphone calls.

### Quality is measured

Each feature has a test set of 100-200 real, anonymised examples from the pilot (with its permission), each with the
expected answer. It picks the cheapest model and effort that clears the bar, and runs again whenever a prompt or a
model list changes.

### Recordings

Call recordings and voice notes are stored as sensitive files (`documents:view_sensitive`) and kept for now, so the
pilot's quality can be checked; how long to keep them is decided before general release. A call is recorded only
when staff tap Record. Agencies tell their customers that calls may be recorded (a line in their terms or first
message), as India's DPDP Act expects.

## Context

The Foundation spec parked AI features (Q10). On 2026-10-16 the owner approved a Phase 1 scope with the AI features
above, chose OpenRouter so models and providers can change without code changes, and keeps zero data retention in the
OpenRouter account. The owner wants AI that does excellent work on small, cheap models, with people always in
control.

## Consequences

- No AI feature can leak another organization's data: context is assembled under row-level security.
- Switching models or providers is configuration plus a test run, not a code change.
- The test sets have to be built from pilot data and maintained; without them no model may be changed.
- OpenRouter is a dependency for every AI feature. When it fails, the forms still work by hand and the failure is
  shown plainly; nothing waits on AI to save.
- AI cost is visible per organization and per feature from `ai_usage`.
- New tables: `ai_usage`, `ai_correction` and the provenance table from ADR 0028, each with `organization_id`, row-level
  security and an isolation fixture.
