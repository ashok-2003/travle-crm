// The recording wrapper (the failed-emails spec, 2026-11-02): every process sends through it, so every email is kept
// as sent, for the console's failed emails. It records the email, sends it with the row's id in X-Mailin-custom (Brevo
// returns that header's value in its webhook events), then marks it sent, or failed with the adapter's safe code and
// rethrows the same error, so the callers' retries and give-ups don't change. The record never stops an email: when
// the database can't take it, the email goes anyway and one warning says so, by names and codes only.
import type { EmailMessage, EmailSender } from "@travel-crm/integrations/email";
import { errorFields, type Logger } from "@travel-crm/integrations/logging";
import type { EmailLogStore } from "./store.js";

/** The header Brevo hands back in its webhook events: our row's id. */
export const EMAIL_REFERENCE_HEADER = "X-Mailin-custom";

/** A resend's new row (null when it couldn't be recorded) and how its send went. */
export type ResendOutcome =
  { id: string | null; status: "sent" } | { id: string | null; status: "failed"; failureCode: string };

export interface RecordedEmailSender extends EmailSender {
  /**
   * Sends a stored email again, as it was, recorded as a new row that names it (`resent_from_id`) with its purpose and
   * source. A failed send is answered, not thrown.
   */
  resend(stored: EmailMessage & { id: string }): Promise<ResendOutcome>;
}

/**
 * What the email log keeps of a failed send: the adapter's code and the server's reply code (the SMTP adapter's safe
 * error carries both, e.g. "EAUTH (SMTP 535)"), else the error's name. Never its message, which may name the recipient.
 */
export function failureCodeOf(error: unknown): string {
  const { code, responseCode, name } = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    responseCode?: unknown;
    name?: unknown;
  };
  const reply = typeof responseCode === "number" ? ` (SMTP ${String(responseCode)})` : "";
  if (typeof code === "string" && code !== "") return `${code}${reply}`;
  return `${typeof name === "string" && /^[A-Za-z][\w.]{0,60}$/.test(name) ? name : "Error"}${reply}`;
}

export function recordedEmailSender(sender: EmailSender, store: EmailLogStore, logger: Logger): RecordedEmailSender {
  /** A step of the record that failed: the email's fate doesn't depend on it, so it is only told. */
  const warn = (step: string) => (error: unknown) => {
    logger.warn({ ...errorFields(error), step }, "The email log couldn't record an email; the email is unaffected");
    return null;
  };

  /** Records, sends and marks one email. */
  const recordAndSend = async (message: EmailMessage, resentFromId?: string) => {
    const id = await store.started(message, resentFromId === undefined ? {} : { resentFromId }).catch(warn("started"));
    const withReference: EmailMessage =
      id === null ? message : { ...message, headers: { ...message.headers, [EMAIL_REFERENCE_HEADER]: id } };
    try {
      await sender.send(withReference);
    } catch (error) {
      const failureCode = failureCodeOf(error);
      if (id !== null) await store.failed(id, failureCode, new Date()).catch(warn("failed"));
      return { id, failed: { error, failureCode } };
    }
    if (id !== null) await store.sent(id, new Date()).catch(warn("sent"));
    return { id, failed: null };
  };

  return {
    send: async (message) => {
      const { failed } = await recordAndSend(message);
      // The same error, so the callers' retry and give-up logic sees exactly what the adapter threw.
      if (failed !== null) throw failed.error;
    },
    resend: async ({ id: resentFromId, ...message }) => {
      const { id, failed } = await recordAndSend(message, resentFromId);
      return failed === null ? { id, status: "sent" } : { id, status: "failed", failureCode: failed.failureCode };
    },
  };
}
