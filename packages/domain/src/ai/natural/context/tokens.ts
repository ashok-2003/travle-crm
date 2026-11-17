// The natural agent's context budgets (spec 4.1): a cheap token estimate, each block's limit, and cutting text to a length.

/** Four characters a token (ruling 9); the trace's real input tokens check it. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

/** Tokens each block may take: the prompt by ruling 3 (6,000 since prompt v2; v4 is about 5,900), the agency block and the turn block by ruling 19. */
export const NATURAL_BUDGETS = { prompt: 6_500, agency: 900, trips: 8_000, chat: 3_000, turn: 4_500 } as const;

/** Cut before `most` characters at a word, so a number isn't cut in half (unless the text has no space to cut at). */
export function cutText(text: string, most: number): string {
  if (text.length <= most) return text;
  const head = text.slice(0, most - 1);
  const space = head.lastIndexOf(" ");
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}
