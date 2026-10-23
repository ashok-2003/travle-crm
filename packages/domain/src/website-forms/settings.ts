// The agency's one form (W1-W5, spec 7.1): read it, save its fields, words and embedding, turn it on and off, and change its
// link. Opening the settings page writes nothing; the first save or turn-on makes the row, off.
import {
  isSecureLink,
  type DestinationInput,
  type FieldMode,
  type SaveWebsiteFormInput,
} from "@travel-crm/contracts/website-forms";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit, type AuditSnapshot } from "../audit/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { newKeySecret } from "./key.js";

/** A website_form row, every mode typed by its contract's list (the table's CHECKs hold the same lists). */
export interface WebsiteFormRow {
  organizationId: string;
  id: string;
  keySecret: string;
  enabled: boolean;
  allowEmbed: boolean;
  emailMode: FieldMode;
  destinationMode: FieldMode;
  destinationInput: DestinationInput;
  travelMonthMode: FieldMode;
  travellersMode: FieldMode;
  budgetMode: FieldMode;
  messageMode: FieldMode;
  offersTickbox: boolean;
  heading: string | null;
  introduction: string | null;
  thankYouMessage: string | null;
  websiteUrl: string | null;
  websiteButtonText: string | null;
  privacyUrl: string | null;
  keyChangedAt: Date | null;
}

type StoredForm = NonNullable<Awaited<ReturnType<OrgTx["websiteForm"]["findFirst"]>>>;

function toRow(row: StoredForm): WebsiteFormRow {
  return {
    ...row,
    emailMode: row.emailMode as FieldMode,
    destinationMode: row.destinationMode as FieldMode,
    destinationInput: row.destinationInput as DestinationInput,
    travelMonthMode: row.travelMonthMode as FieldMode,
    travellersMode: row.travellersMode as FieldMode,
    budgetMode: row.budgetMode as FieldMode,
    messageMode: row.messageMode as FieldMode,
  };
}

const AUDITED_TYPE = "website_form";

/** The organization's form, or null before the first save. */
export async function readWebsiteForm(tx: OrgTx): Promise<WebsiteFormRow | null> {
  const row = await tx.websiteForm.findFirst();
  return row === null ? null : toRow(row);
}

/** The form, made with the defaults of W2 and no words when there is none. Two people at once make one (ON CONFLICT). */
async function ensureForm(tx: OrgTx, actor: Actor): Promise<WebsiteFormRow> {
  const existing = await readWebsiteForm(tx);
  if (existing) return existing;
  await tx.websiteForm.createMany({
    data: [
      {
        organizationId: actor.organizationId,
        keySecret: newKeySecret(),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    ],
    skipDuplicates: true,
  });
  const form = await readWebsiteForm(tx);
  if (form === null) throw new DomainError("NOT_FOUND", "FORM_NOT_FOUND", "The form could not be made");
  return form;
}

const fieldsOf = (form: WebsiteFormRow | SaveWebsiteFormInput): AuditSnapshot => ({
  emailMode: form.emailMode,
  destinationMode: form.destinationMode,
  destinationInput: form.destinationInput,
  travelMonthMode: form.travelMonthMode,
  travellersMode: form.travellersMode,
  budgetMode: form.budgetMode,
  messageMode: form.messageMode,
  offersTickbox: form.offersTickbox,
});

/** The agency's words by length only: the log never holds the text or an address (spec 9). */
const wordsOf = (form: WebsiteFormRow | SaveWebsiteFormInput): AuditSnapshot => ({
  headingLength: form.heading?.length ?? 0,
  introductionLength: form.introduction?.length ?? 0,
  thankYouLength: form.thankYouMessage?.length ?? 0,
  websiteButtonTextLength: form.websiteButtonText?.length ?? 0,
  websiteUrlLength: form.websiteUrl?.length ?? 0,
  privacyUrlLength: form.privacyUrl?.length ?? 0,
});

const same = (a: AuditSnapshot, b: AuditSnapshot) => JSON.stringify(a) === JSON.stringify(b);

function assertSecureLinks(input: SaveWebsiteFormInput): void {
  for (const link of [input.websiteUrl, input.privacyUrl]) {
    if (link !== null && !isSecureLink(link)) {
      throw new DomainError(
        "VALIDATION",
        "FORM_LINK_INVALID",
        "A website or privacy address must be an https:// address on a web site name, without a login",
      );
    }
  }
}

/**
 * Saves the fields, words and embedding (W1-W3). The first save makes the form, off. One audit entry for each of fields,
 * words and embedding that changed; the log holds modes, flags and text lengths, never the key.
 */
export async function saveWebsiteForm(tx: OrgTx, actor: Actor, input: SaveWebsiteFormInput): Promise<WebsiteFormRow> {
  assertSecureLinks(input);
  const before = await ensureForm(tx, actor);
  const fieldsBefore = fieldsOf(before);
  const wordsBefore = wordsOf(before);
  const saved = toRow(
    await tx.websiteForm.update({
      where: { id: before.id },
      data: { ...input, updatedBy: actor.userId },
    }),
  );
  const { id: entityId } = saved;
  const entityType = AUDITED_TYPE;
  if (!same(fieldsBefore, fieldsOf(saved))) {
    await recordAudit(tx, actor, {
      action: "website-form.fields-changed",
      entityType,
      entityId,
      before: fieldsBefore,
      after: fieldsOf(saved),
    });
  }
  if (!same(wordsBefore, wordsOf(saved))) {
    await recordAudit(tx, actor, {
      action: "website-form.words-changed",
      entityType,
      entityId,
      before: wordsBefore,
      after: wordsOf(saved),
    });
  }
  if (before.allowEmbed !== saved.allowEmbed) {
    await recordAudit(tx, actor, {
      action: "website-form.embed-changed",
      entityType,
      entityId,
      before: { allowEmbed: before.allowEmbed },
      after: { allowEmbed: saved.allowEmbed },
    });
  }
  return saved;
}

/** Turns the form on or off (Take enquiries). Makes the form, off, if there is none; an unchanged switch records nothing. */
export async function setWebsiteFormEnabled(tx: OrgTx, actor: Actor, enabled: boolean): Promise<WebsiteFormRow> {
  const form = await ensureForm(tx, actor);
  if (form.enabled === enabled) return form;
  const saved = toRow(
    await tx.websiteForm.update({ where: { id: form.id }, data: { enabled, updatedBy: actor.userId } }),
  );
  const change = {
    entityType: AUDITED_TYPE,
    entityId: saved.id,
    before: { enabled: form.enabled },
    after: { enabled },
  };
  if (enabled) await recordAudit(tx, actor, { action: "website-form.turned-on", ...change });
  else await recordAudit(tx, actor, { action: "website-form.turned-off", ...change });
  return saved;
}

/** Writes a new random part: the old key stops working at once (W5). The log records that it changed, never the key. */
export async function changeWebsiteFormLink(tx: OrgTx, actor: Actor, now: Date): Promise<WebsiteFormRow> {
  const form = await readWebsiteForm(tx);
  if (form === null) throw new DomainError("NOT_FOUND", "FORM_NOT_FOUND", "There is no form to change the link of");
  let keySecret = newKeySecret();
  while (keySecret === form.keySecret) keySecret = newKeySecret();
  const saved = toRow(
    await tx.websiteForm.update({
      where: { id: form.id },
      data: { keySecret, keyChangedAt: now, updatedBy: actor.userId },
    }),
  );
  await recordAudit(tx, actor, {
    action: "website-form.link-changed",
    entityType: AUDITED_TYPE,
    entityId: saved.id,
    before: { keyChangedAt: form.keyChangedAt?.toISOString() ?? null },
    after: { keyChangedAt: now.toISOString() },
  });
  return saved;
}
