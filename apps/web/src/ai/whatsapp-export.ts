// Reads a WhatsApp chat export (.txt, "Export chat" without media) in the browser, for the AI to learn one staff member's
// way of talking: each message with its sender, from Android's "28/10/26, 9:41 pm - Name: text" and the iPhone's
// "[28/10/26, 9:41:03 PM] Name: text"; a message's later lines join it, and what WhatsApp writes itself (media left
// out, deleted messages, missed calls, the encryption notice) is dropped. Only the chosen person's OWN messages are kept
// for the upload: what the other side wrote never leaves the browser.
import { MAX_VOICE_SAMPLE_CHARACTERS } from "@travel-crm/contracts/ai";

export interface ExportedMessage {
  sender: string;
  text: string;
}

const android =
  /^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s?(?:[ap]\.?\s?m\.?)?\s+-\s+([^:]{1,80}):\s([\s\S]*)$/i;
const iphone =
  /^\[(\d{1,4}[./-]\d{1,2}[./-]\d{1,4}),?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s?(?:[ap]\.?\s?m\.?)?\]\s([^:]{1,80}):\s([\s\S]*)$/i;
/** A line that starts a new entry, sender or not (a system line): it ends the message before. */
const startsEntry = /^\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}[:.]\d{2}/;
const written =
  /<media omitted>|^(image|video|audio|sticker|gif|document|contact card) omitted$|this message was deleted|you deleted this message|^missed (voice|video) call|^null$/i;

/** Every message of the export, oldest first. */
export function readWhatsAppExport(text: string): ExportedMessage[] {
  const messages: ExportedMessage[] = [];
  let open = false;
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    // WhatsApp marks some lines with invisible direction marks.
    const line = raw.replace(/[‎‏‪-‮]/g, "");
    const match = android.exec(line) ?? iphone.exec(line);
    if (match?.[2] !== undefined && match[3] !== undefined) {
      // An unsaved contact is "~ Name".
      messages.push({ sender: match[2].replace(/^~\s*/, "").trim(), text: match[3] });
      open = true;
    } else if (startsEntry.test(line)) {
      open = false;
    } else if (open) {
      const last = messages.at(-1);
      if (last !== undefined) last.text = `${last.text}\n${line}`;
    }
  }
  return messages
    .map((message) => ({ ...message, text: message.text.replace(/\s*<This message was edited>$/i, "").trim() }))
    .filter((message) => message.text !== "" && !written.test(message.text));
}

/** The people who wrote, most messages first. */
export function sendersOf(messages: ExportedMessage[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const message of messages) counts.set(message.sender, (counts.get(message.sender) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/**
 * One chat's export for its own voice: the latest lines of both sides in order, the chosen person's marked as theirs. The
 * other side's words go too (the AI reads what the two talked about); the agency-wide style never sends them.
 */
export function conversationOf(messages: ExportedMessage[], sender: string): { own: boolean; text: string }[] {
  const chosen: { own: boolean; text: string }[] = [];
  let left = MAX_VOICE_SAMPLE_CHARACTERS;
  for (const message of [...messages].reverse()) {
    const text = message.text.slice(0, 1000);
    if (text.length > left || chosen.length >= 1500) break;
    chosen.unshift({ own: message.sender === sender, text });
    left -= text.length;
  }
  return chosen;
}

/**
 * The chosen person's own latest messages, oldest first, within what one request may carry. Everything the other side
 * wrote is dropped here, in the browser, before anything is sent.
 */
export function ownMessagesOf(messages: ExportedMessage[], sender: string): string[] {
  const chosen: string[] = [];
  let left = MAX_VOICE_SAMPLE_CHARACTERS;
  for (const message of [...messages].reverse()) {
    if (message.sender !== sender) continue;
    const text = message.text.slice(0, 1000);
    if (text.length > left || chosen.length >= 1500) break;
    chosen.unshift(text);
    left -= text.length;
  }
  return chosen;
}
