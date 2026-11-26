# Every AI prompt in Langfuse

**Goal (the owner, 2026-11-26):** "put all that so that I can manage all my AI prompts at one place." Every AI
feature's instructions are read from Langfuse prompt management (label `production`), versioned there, with the code's
own text as the fallback when Langfuse is off, slow or has no such prompt.

**Already managed:** `whatsapp-agent/real-agent`, `whatsapp-agent/chat-summary`, `package-changes/system`.

**Groundwork (done, commit 4b763866):**
- `packages/domain/src/ai/managed-prompt.ts`: `managedPrompt(prompts, name, builtIn)` gives a `NaturalPrompt`
  (Langfuse's production text with `source: { name, version, label }`, else the built-in text with no `source`), and
  `filled(text, values)` fills `{{placeholders}}`.
- `AiRequest.prompt?: { name, version }` (integrations): the trace links that call's generation to the Langfuse prompt.
  Pass it only when the prompt came from Langfuse (`prompt.source` defined).
- Every `prompt-text.ts` under `packages/domain/src/ai` imports nothing and exports
  `MANAGED_PROMPTS: readonly { name, text }[]`; `test/ai/managed-prompts-list.test.ts` checks names are unique
  `area/name`, and that each name appears as a string literal in the code outside the text files.
- The upload (owner-run, outside the repo) loads every `prompt-text.ts` and creates in Langfuse only the names it lacks.

## Prompts to move

| Feature (`feature:`) | Name | Where the instructions are today |
|---|---|---|
| `score_lead` | `lead-scoring/system` | `ai/insight.ts` (`promptOf`) |
| `suggest_reply` | `suggest-reply/system` | `ai/prompt.ts` (`promptOf`) |
| `write_up` | `write-up/system` | `ai/write-up/prompt.ts` |
| `ask_report` | `ask-reports/system` | `ai/ask/choose.ts` |
| `reach_out` | `empty-seats/reach-out` | `ai/seats/prompt.ts` (`RULES`) |
| `agent_voice` / `agent_image` | `whatsapp-agent/voice-note`, `whatsapp-agent/photo`, `whatsapp-agent/pdf` | `ai/one/media-asking.ts` |
| `fill_form` | `fill-form/system`, `fill-form/travellers` | `ai/fill/prompt.ts`, `ai/fill/travellers-prompt.ts` |
| `draft_days` | `draft-days/system` | `ai/fill/draft-days-prompt.ts` |
| `draft_packages` | `package-drafts/find-trips`, `package-drafts/draft-package` | `ai/drafts/find-trips.ts`, `ai/drafts/draft-package.ts` |
| `read_rates` | `rate-sheets/read` | `ai/rates/prompt.ts` |
| `read_requests` | `rooming/read-requests` | `ai/rooming/prompt.ts` |

A file the table names that turns out to hold no model instructions (or more than one prompt) is the builder's call:
one Langfuse prompt per distinct instruction text, named `<area>/<what it does>`.

## Rules for each prompt

1. **Same words when Langfuse is off.** The messages a call sends must be exactly what they are today when there is no
   Langfuse prompt. Existing tests keep passing unchanged: never edit an existing assertion to make it pass.
2. **Only the fixed instructions move** (usually the system message). The record's data stays in the code's own messages,
   fenced as it is today. Where today's instructions contain a value (a date, the agency's name, a style line), the text
   gets a `{{placeholder}}` and the code fills it with `filled()`; the built-in text then holds the same placeholder.
3. **The built-in text** goes in the folder's import-free `prompt-text.ts` (one per folder; add to it if it exists,
   e.g. `one/prompt-text.ts`), listed in its `MANAGED_PROMPTS`. The name constant (`export const X_PROMPT_NAME =
   "area/name"`) lives in the code file that reads it.
4. **One read per call:** `const prompt = await managedPrompt(prompts, X_PROMPT_NAME, X_PROMPT_TEXT)`; send
   `prompt.text` (filled); pass `...(prompt.source ? { prompt: { name: prompt.source.name, version: prompt.source.version } } : {})`
   on `model.complete`.
5. **Plumbing:** the feature takes `prompts?: AiPrompts` (optional; left out, the built-in text). The api passes
   `ctx.prompts`; the worker passes its `prompts` dependency (`apps/api/src/worker-jobs.ts`). Follow how
   `package-changes` and `chat-summary` receive it.
6. **Tests per prompt** (with `createMemoryPrompts`): with a production version, the call's instructions are Langfuse's
   text (placeholders filled) and the request carries `prompt: { name, version }`; without one, the built-in text and no
   `prompt`.
7. Strict TypeScript, each new file starts with a one-line comment, Conventional Commits, stage files by name, never
   `--no-verify`, never a `Co-Authored-By` trailer.
