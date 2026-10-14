// Issues a document (spec 9.3): gives it the organization's next number, freezes its content and branding, and
// publishes document.issued so the worker renders its PDF. Runs in the caller's transaction.
import type {
  IssueDocumentInput,
  IssuedDocumentRenderInput,
  IssuedDocumentSummary,
} from "@travel-crm/contracts/documents";
import { nextDocumentNumber, type OrgTx } from "@travel-crm/db";
import { characterLabel, unprintableCharactersIn } from "@travel-crm/integrations/pdf";
import { publishEvent } from "../jobs/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { summaryFields, toSummary } from "./issued-document-row.js";

export interface IssueDocumentOptions extends IssueDocumentInput {
  /** The organization's IANA time zone: the document's year and date are counted in it. */
  timeZone: string;
  /** 2-5 capital letters before the number. "DOC" unless a module has its own, such as "QT" for quotations. */
  prefix?: string | undefined;
}

/** The year it is in the time zone, e.g. 2027 at 00:30 on 1 January in Kolkata, still 2026 in UTC. */
function yearIn(instant: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric" }).format(instant));
}

/** The date as printed on the document, e.g. "15 Oct 2026". */
function printedDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "numeric", month: "short", year: "numeric" }).format(
    instant,
  );
}

/**
 * Callers decide whether the actor may issue the document; issuing decides its number and freezes it. What is
 * stored is exactly what the PDF shows, now and whenever it is opened again (spec 9.3: never regenerated). `now` is
 * the one issue time: it is the document's issued_at, and the printed date is that instant in the time zone.
 */
export async function issueDocument(
  tx: OrgTx,
  actor: Actor,
  input: IssueDocumentOptions,
  now: Date = new Date(),
): Promise<IssuedDocumentSummary> {
  // Checked before a number is used: React-PDF would print other letters in place of these.
  const unprintable = unprintableCharactersIn([input.content, input.branding]);
  if (unprintable.length > 0) {
    throw new DomainError(
      "VALIDATION",
      "UNPRINTABLE_CHARACTERS",
      `The document has characters its PDF can't show yet: ${unprintable.map(characterLabel).join(", ")}`,
    );
  }
  const number = await nextDocumentNumber(tx, { prefix: input.prefix ?? "DOC", year: yearIn(now, input.timeZone) });
  const renderInput: IssuedDocumentRenderInput = {
    data: { ...input.content, number, issuedOn: printedDate(now, input.timeZone) },
    branding: input.branding,
  };
  const row = await tx.issuedDocument.create({
    data: {
      template: input.template,
      number,
      title: input.content.title,
      renderInput,
      issuedBy: actor.userId,
      issuedAt: now,
    },
    select: summaryFields,
  });
  await publishEvent(tx, { type: "document.issued", payload: { documentId: row.id } });
  return toSummary(row);
}
