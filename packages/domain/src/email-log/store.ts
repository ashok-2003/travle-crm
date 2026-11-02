// Where the recording wrapper keeps each send: the email_log table, written by the runtime role in db.withoutOrg(),
// each step in a short transaction of its own, so nothing is held open while the email goes out.
import type { Database } from "@travel-crm/db";
import { emailLogs } from "@travel-crm/db/email-log";
import type { EmailMessage } from "@travel-crm/integrations/email";

/** What a purpose may be (CHECK email_log_purpose_format); anything else is recorded as "other". */
const PURPOSE = /^[a-z][a-z-]{0,39}$/;
const MAX_FAILURE_CODE = 100;

export interface EmailLogStore {
  /** Records the email as it starts to go, and returns the row's id. `resentFromId` names the email it sends again. */
  started(message: EmailMessage, options?: { resentFromId?: string }): Promise<string>;
  /** Marks a sending email sent. One a provider already reported failed stays failed. */
  sent(id: string, at: Date): Promise<void>;
  /** Marks a sending email failed by our own send, with the adapter's safe code. */
  failed(id: string, code: string, at: Date): Promise<void>;
}

export function emailLogStore(db: Database): EmailLogStore {
  return {
    started: async (message, options = {}) => {
      const purpose = message.purpose !== undefined && PURPOSE.test(message.purpose) ? message.purpose : "other";
      const row = await db.withoutOrg((tx) =>
        emailLogs(tx).create({
          data: {
            purpose,
            sourceRef: message.sourceRef ?? null,
            toAddress: message.to.address,
            toName: message.to.name ?? null,
            fromName: message.fromName,
            replyTo: message.replyTo ?? null,
            subject: message.subject,
            textBody: message.text,
            htmlBody: message.html,
            headers: { ...message.headers },
            resentFromId: options.resentFromId ?? null,
          },
          select: { id: true },
        }),
      );
      return row.id;
    },
    sent: async (id, at) => {
      await db.withoutOrg((tx) =>
        emailLogs(tx).updateMany({ where: { id, status: "sending" }, data: { status: "sent", sentAt: at } }),
      );
    },
    failed: async (id, code, at) => {
      await db.withoutOrg((tx) =>
        emailLogs(tx).updateMany({
          where: { id, status: "sending" },
          data: { status: "failed", failureSource: "smtp", failureCode: code.slice(0, MAX_FAILURE_CODE), failedAt: at },
        }),
      );
    },
  };
}
