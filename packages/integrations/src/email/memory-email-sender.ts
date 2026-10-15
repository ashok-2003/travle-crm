// An in-memory EmailSender for tests: it records each message after the same header check the SMTP sender makes.
import { assertSafeHeaders, type EmailMessage, type EmailSender } from "./email-sender.js";

export interface MemoryEmailSender extends EmailSender {
  /** Every message sent so far, oldest first. */
  readonly sent: readonly EmailMessage[];
}

export function createMemoryEmailSender(): MemoryEmailSender {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: (message) =>
      new Promise((resolve) => {
        assertSafeHeaders(message);
        sent.push(message);
        resolve();
      }),
  };
}
