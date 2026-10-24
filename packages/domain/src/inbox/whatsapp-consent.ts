// WhatsApp consent (spec 4.4 S7, D19): the person_consent ledger with the purpose `whatsapp`, append-only, the latest row
// deciding. Staff tick "they agreed to WhatsApp messages" once (source staff); a customer who writes STOP, UNSUBSCRIBE or
// "stop messages" opts out (source customer). An opt-out can be undone only when the customer has written since and staff
// tick again, which is audited as restored. The audit says that consent changed and how, never the customer's words.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";

const WORDING_VERSION = 1;
const AGREED_WORDING = "Agreed to WhatsApp messages; recorded by staff.";
const OPT_OUT_WORDING = "Asked to stop WhatsApp messages.";

/** Whether a customer's whole message is a request to stop (case and spacing ignored). */
export function isOptOutText(text: string | null): boolean {
  if (text === null) return false;
  return ["stop", "unsubscribe", "stop messages"].includes(text.trim().replace(/\s+/g, " ").toLowerCase());
}

export interface WhatsappConsent {
  state: "granted" | "withdrawn" | null;
  /** Whose row it is: the customer's own (an opt-out) or staff's tick. */
  source: "staff" | "customer" | null;
  at: Date | null;
}

export async function whatsappConsentOf(tx: OrgTx, personId: string): Promise<WhatsappConsent> {
  const latest = await tx.personConsent.findFirst({
    where: { personId, purpose: "whatsapp" },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
  });
  if (latest === null) return { state: null, source: null, at: null };
  return {
    state: latest.action === "withdrawn" ? "withdrawn" : "granted",
    source: latest.source === "customer" ? "customer" : "staff",
    at: latest.recordedAt,
  };
}

async function append(
  tx: OrgTx,
  actor: Actor,
  input: {
    personId: string;
    decision: "granted" | "withdrawn";
    source: "staff" | "customer";
    wording: string;
    now: Date;
  },
): Promise<void> {
  await tx.personConsent.create({
    data: {
      personId: input.personId,
      purpose: "whatsapp",
      action: input.decision,
      wording: input.wording,
      wordingVersion: WORDING_VERSION,
      source: input.source,
      recordedAt: input.now,
      recordedBy: actor.userId,
    },
  });
}

/** Staff ticked that the person agreed. `restored` marks the tick that follows an opt-out. */
export async function grantWhatsappConsent(
  tx: OrgTx,
  actor: Actor,
  input: { personId: string; restored: boolean; now: Date },
): Promise<void> {
  await append(tx, actor, {
    personId: input.personId,
    decision: "granted",
    source: "staff",
    wording: AGREED_WORDING,
    now: input.now,
  });
  const about = { entityType: "person", entityId: input.personId, after: { purpose: "whatsapp", source: "staff" } };
  if (input.restored) await recordAudit(tx, actor, { action: "whatsapp.consent-restored", ...about });
  else await recordAudit(tx, actor, { action: "whatsapp.consent-granted", ...about });
}

/** The customer asked to stop. Nothing is recorded twice in a row. */
export async function recordWhatsappOptOut(
  tx: OrgTx,
  actor: Actor,
  input: { personId: string; now: Date },
): Promise<void> {
  if ((await whatsappConsentOf(tx, input.personId)).state === "withdrawn") return;
  await append(tx, actor, {
    personId: input.personId,
    decision: "withdrawn",
    source: "customer",
    wording: OPT_OUT_WORDING,
    now: input.now,
  });
  await recordAudit(tx, actor, {
    action: "whatsapp.opted-out",
    entityType: "person",
    entityId: input.personId,
    after: { purpose: "whatsapp", source: "customer" },
  });
}
