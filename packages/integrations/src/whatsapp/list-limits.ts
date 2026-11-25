// WhatsApp's limits on a list message, checked before any request, as the reply buttons' are: MSG91 answers a bad
// message with an empty 400, which would show only as a failed send nobody can explain.
import type { WhatsAppListToSend } from "./whatsapp-provider.js";

/** Meta's limits (MSG91 documents none); the body is held to the reply buttons' 1,024. */
export const LIST_LIMITS = {
  rows: 10,
  button: 20,
  title: 24,
  description: 72,
  id: 200,
  sectionTitle: 24,
  body: 1024,
} as const;

const fits = (text: string, most: number) => text.trim() !== "" && text.length <= most;

/** Whether the list fits WhatsApp's limits (UTF-16 length, the stricter way to count). */
export function listFits(message: WhatsAppListToSend): boolean {
  const { sections } = message;
  const rows = sections.flatMap((section) => section.rows);
  if (!fits(message.body, LIST_LIMITS.body) || !fits(message.button, LIST_LIMITS.button)) return false;
  if (rows.length < 1 || rows.length > LIST_LIMITS.rows || sections.some((section) => section.rows.length === 0)) {
    return false;
  }
  // One section may go untitled; two or more each need a title.
  const titled = sections.every(({ title }) =>
    title === undefined ? sections.length === 1 : fits(title, LIST_LIMITS.sectionTitle),
  );
  if (!titled || new Set(rows.map((row) => row.id)).size !== rows.length) return false;
  return rows.every(
    (row) =>
      // An id comes back exactly as sent, so it holds no whitespace or control characters to be rewritten on the way.
      /^[^\s\p{Cc}]+$/u.test(row.id) &&
      row.id.length <= LIST_LIMITS.id &&
      fits(row.title, LIST_LIMITS.title) &&
      (row.description === undefined || row.description.length <= LIST_LIMITS.description),
  );
}
