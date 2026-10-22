// A person's marketing consent (website form spec 4.3, 7.3): an append-only ledger, the latest row decides. A tick on the
// form records "granted" with the exact words shown; staff record that a person stopped. An unticked box records nothing
// and never withdraws. The audit log says that consent changed and by which words' version, never the words.
import { OFFERS_WORDING_VERSION } from "@travel-crm/contracts/website-forms";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import type { Actor } from "../kernel/index.js";
import { recordCrmAudit } from "./crm-audit.js";

/** What the ledger says of a person's staff withdrawal, as the wording a later reader sees. */
const STAFF_WITHDRAWAL_WORDING = "Asked to stop travel offers; recorded by staff.";

/** Records that the person agreed to marketing, in the words they were shown, from the form. */
export async function recordConsent(
  tx: OrgTx,
  actor: Actor,
  input: { personId: string; wording: string; wordingVersion: number; formId: string; now: Date },
): Promise<void> {
  await tx.personConsent.create({
    data: {
      personId: input.personId,
      purpose: "marketing",
      action: "granted",
      wording: input.wording,
      wordingVersion: input.wordingVersion,
      source: "web_form",
      sourceFormId: input.formId,
      recordedAt: input.now,
      recordedBy: actor.userId,
    },
  });
  await recordCrmAudit(tx, actor, {
    action: "person.consent-recorded",
    entityType: "person",
    entityId: input.personId,
    after: { purpose: "marketing", source: "web_form", wordingVersion: input.wordingVersion },
  });
}

/** Records that the person stopped offers, when they had agreed; a person who hasn't agreed is left as they are. */
export async function withdrawConsent(
  tx: OrgTx,
  actor: MemberAccess,
  input: { personId: string; now: Date },
): Promise<void> {
  if ((await consentStateOf(tx, input.personId)).state !== "granted") return;
  await tx.personConsent.create({
    data: {
      personId: input.personId,
      purpose: "marketing",
      action: "withdrawn",
      wording: STAFF_WITHDRAWAL_WORDING,
      wordingVersion: OFFERS_WORDING_VERSION,
      source: "staff",
      recordedAt: input.now,
      recordedBy: actor.userId,
    },
  });
  await recordCrmAudit(tx, actor, {
    action: "person.consent-withdrawn",
    entityType: "person",
    entityId: input.personId,
    after: { purpose: "marketing", source: "staff" },
  });
}

/** Where the person stands: the latest row decides; `fromForm` says the row came from the website form. */
export async function consentStateOf(
  tx: OrgTx,
  personId: string,
): Promise<{ state: "granted" | "withdrawn" | null; at: Date | null; fromForm: boolean }> {
  const latest = await tx.personConsent.findFirst({
    where: { personId, purpose: "marketing" },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
  });
  if (latest === null) return { state: null, at: null, fromForm: false };
  return {
    state: latest.action === "withdrawn" ? "withdrawn" : "granted",
    at: latest.recordedAt,
    fromForm: latest.source === "web_form",
  };
}
