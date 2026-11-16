// Reads a WhatsApp chat export (.txt, "Export chat" without media) in the browser, for "Fill it for me" to read a chat
// into a form: each message with its sender, from Android's "28/10/26, 9:41 pm - Name: text" and the iPhone's
// "[28/10/26, 9:41:03 PM] Name: text"; a message's later lines join it, and what WhatsApp writes itself (media left
// out, deleted messages, missed calls, the encryption notice) is dropped.
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
