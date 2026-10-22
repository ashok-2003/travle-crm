// Whether a form can take enquiries right now, and why not (W6, W7, F14): one function serves the visitor's page, the
// submission and the settings page. A visitor is told nothing but "unavailable"; the Owner is told the reason.
import { timingSafeEqual } from "node:crypto";
import type { FormState, FormVia } from "@travel-crm/contracts/website-forms";
import type { OrgTx } from "@travel-crm/db";
import { DomainError } from "../kernel/index.js";
import { entitlementsOf, isOnDemoPlan } from "../subscriptions/index.js";
import { parseFormKey } from "./key.js";
import { readWebsiteForm, type WebsiteFormRow } from "./settings.js";

export type FormClosedReason = NonNullable<FormState["reason"]>;

/**
 * The form's state for the organization: the demo is never open (F14), a subscription that is read-only, suspended or
 * cancelled closes it (check 2 of ADR 0021 for a call that changes), the plan must hold crm (check 3), there must be an
 * Owner to give the lead to, and the switch must be on. The first reason that applies is the one named.
 */
export async function formOpenState(
  tx: OrgTx,
  input: {
    organizationId: string;
    form: WebsiteFormRow | null;
    ownerUserId: string | null;
    now: Date;
    /** The visitor's page; the settings page names none. An embed with embedding off is closed as the form is off. */
    via?: FormVia;
  },
): Promise<FormState> {
  const closed = (reason: FormClosedReason): FormState => ({ open: false, reason });
  if (await isOnDemoPlan(tx, input.organizationId)) return closed("demo");
  const entitlements = await entitlementsOf(tx, input.organizationId, input.now);
  if (entitlements === null) return closed("plan");
  if (entitlements.access === "locked") return closed("cancelled");
  if (entitlements.access === "export_only") return closed("suspended");
  if (entitlements.access === "read_only") return closed("read_only");
  if (!entitlements.modules.has("crm")) return closed("plan");
  if (input.ownerUserId === null) return closed("no_owner");
  if (!input.form?.enabled) return closed("off");
  if (input.via === "embedded" && !input.form.allowEmbed) return closed("off");
  return { open: true, reason: null };
}

/** The error the Owner meets turning the form on with nobody to give the leads to; the visitor never sees it. */
export function assertHasOwner(ownerUserId: string | null): string {
  if (ownerUserId === null) {
    throw new DomainError("CONFLICT", "FORM_NEEDS_OWNER", "The organization has no active Owner to give enquiries to");
  }
  return ownerUserId;
}

const notFound = () => new DomainError("NOT_FOUND", "FORM_NOT_FOUND", "No such form");

function sameSecret(given: string, stored: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(stored);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * For a visitor, inside the organization: the form whose key this is, when it can take enquiries. A wrong key or no
 * form is FORM_NOT_FOUND (404), found after the organization is opened so the time taken says little; every closed state
 * is the one FORM_UNAVAILABLE (403), the Owner-only FORM_NEEDS_OWNER included.
 */
export async function assertFormOpen(
  tx: OrgTx,
  input: { key: string; organizationId: string; ownerUserId: string | null; via: FormVia; now: Date },
): Promise<WebsiteFormRow> {
  const parsed = parseFormKey(input.key);
  if (parsed?.organizationId !== input.organizationId) throw notFound();
  const form = await readWebsiteForm(tx);
  if (form === null || !sameSecret(parsed.keySecret, form.keySecret)) throw notFound();
  const state = await formOpenState(tx, { ...input, form });
  if (!state.open) {
    throw new DomainError("FORBIDDEN", "FORM_UNAVAILABLE", "This form is not taking enquiries");
  }
  return form;
}
