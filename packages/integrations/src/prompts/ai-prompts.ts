// The AI prompts port: a text prompt kept outside the code (Langfuse's prompt management), read by name and by label, the
// pointer a person moves to the version that is live ("production") or being tried ("draft"). Adapters: Langfuse, none, and
// the in-memory one tests read. A prompt that can't be had (none at that label, the service off, slow or down) is null,
// never an error, so the caller goes on with its own text.

/** A text prompt as the service keeps it: its name, the version the label pointed to, and its words. */
export interface ManagedPrompt {
  name: string;
  /** The service's version number: 1, 2, 3... */
  version: number;
  /** The label it was read at. */
  label: string;
  /** Its template, variables written {{like_this}}. */
  text: string;
}

export interface PromptRequest {
  /** Ask the service now, past the cache: for a prompt being edited (Try it's draft). Still bounded in time. */
  fresh?: boolean;
}

export interface AiPrompts {
  /** The text prompt `name` at `label`, or null when there is none to have in time. Never throws or rejects. */
  textPrompt(name: string, label: string, request?: PromptRequest): Promise<ManagedPrompt | null>;
}

/** No prompts (no Langfuse keys): every caller uses its own text. */
export const noPrompts: AiPrompts = {
  textPrompt: () => Promise.resolve(null),
};
