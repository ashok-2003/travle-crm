// Issues a document (spec 9.3): gives it the organization's next number, freezes its content and branding,
// publishes document.issued so the worker renders its PDF, and records it in the audit log. Runs in the caller's
// transaction.
import {
  issueDocumentInput,
  type IssueDocumentInput,
  type IssuedDocumentRenderInput,
  type IssuedDocumentSummary,
} from "@travel-crm/contracts/documents";
import { nextDocumentNumber, type OrgTx } from "@travel-crm/db";
import { characterLabel, unprintableCharactersIn } from "@travel-crm/integrations/pdf";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { publishEvent } from "../jobs/index.js";
import { DomainError, formatDateTime, yearIn, type Actor } from "../kernel/index.js";
import { summaryFields, toSummary } from "./issued-document-row.js";

export interface IssueDocumentOptions extends IssueDocumentInput {
  /** 2-5 capital letters before the number. "DOC" unless a module has its own, such as "QT" for quotations. */
  prefix?: string | undefined;
}

/**
 * Callers decide whether the actor may issue the document; issuing decides its number and freezes it. What is
 * stored is exactly what the PDF shows, now and whenever it is opened again (spec 9.3: never regenerated). `now` is
 * the one issue time: it is the document's issued_at, and the printed date is that instant in the organization's
 * time zone (read here, from the organization).
 */
export async function issueDocument(
  tx: OrgTx,
  actor: Actor,
  input: IssueDocumentOptions,
  now: Date = new Date(),
): Promise<IssuedDocumentSummary> {
  // The contract is checked here too, before a number is used, and what is frozen is the parsed (trimmed) value: it
  // is what prints. Callers pass user input, and the PDF would otherwise show text the contract never allowed.
  const checked = issueDocumentInput.safeParse({
    template: input.template,
    content: input.content,
    branding: input.branding,
  });
  if (!checked.success) {
    throw new DomainError("VALIDATION", "INVALID_DOCUMENT", "The document can't be issued as it is");
  }
  const { content, branding } = checked.data;
  // Checked before a number is used: React-PDF would print other letters in place of these.
  const unprintable = unprintableCharactersIn([content, branding]);
  if (unprintable.length > 0) {
    throw new DomainError(
      "VALIDATION",
      "UNPRINTABLE_CHARACTERS",
      `The document has characters its PDF can't show yet: ${unprintable.map(characterLabel).join(", ")}`,
    );
  }
  // The organization's own zone, so a caller can't freeze the wrong year and date into a numbered document.
  const timeZone = await organizationTimeZone(tx, actor.organizationId);
  // The year and date as the organization's clocks show them: 00:30 on 1 January in Kolkata is still 2026 in UTC.
  const number = await nextDocumentNumber(tx, { prefix: input.prefix ?? "DOC", year: yearIn(now, timeZone) });
  const renderInput: IssuedDocumentRenderInput = {
    data: { ...content, number, issuedOn: formatDateTime(now, { timeZone, style: "date" }) },
    branding,
  };
  const row = await tx.issuedDocument.create({
    data: {
      template: input.template,
      number,
      title: content.title,
      renderInput,
      issuedBy: actor.userId,
      issuedAt: now,
    },
    select: summaryFields,
  });
  await publishEvent(tx, { type: "document.issued", payload: { documentId: row.id } });
  // The id and the number only: the content is the customer's, and the document itself keeps it.
  await recordAudit(tx, actor, {
    action: "document.issued",
    entityType: "issued_document",
    entityId: row.id,
    after: { number },
  });
  return toSummary(row);
}
