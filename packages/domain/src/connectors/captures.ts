// Website forms and incoming lead links (release D): made, renamed and switched off by whoever manages settings; each
// has a token naming its organization and a secret whose hash alone is kept, shown once. A form's public page reads
// its words; a lead posted to either comes in as crm's lead from outside, from the website form or another tool.
import {
  formSettings,
  incomingLead,
  type CreateLeadCaptureInput,
  type FormSettings,
  type IntakeLeadResult,
  type LeadCapture,
} from "@travel-crm/contracts/connectors";
import type { Database, OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { DomainError, type Actor } from "../kernel/index.js";
import { newOrganizationToken, parseOrganizationToken } from "../share-links/index.js";
import { takeLead, type IntakeDependencies } from "./intake.js";

interface CaptureRow {
  id: string;
  kind: string;
  name: string;
  settings: unknown;
  createdAt: Date;
  disabledAt: Date | null;
}

const settingsOf = (stored: unknown): FormSettings => formSettings.parse(stored ?? {});

function captureOf(row: CaptureRow): LeadCapture {
  return {
    id: row.id,
    kind: row.kind === "form" ? "form" : "link",
    name: row.name,
    settings: settingsOf(row.settings),
    createdAt: row.createdAt.toISOString(),
    disabled: row.disabledAt !== null,
  };
}

const notFound = () => new DomainError("NOT_FOUND", "CAPTURE_NOT_FOUND", "No such form or link");

export async function listCaptures(tx: OrgTx): Promise<LeadCapture[]> {
  const rows = await tx.leadCapture.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(captureOf);
}

export async function createCapture(
  tx: OrgTx,
  actor: Actor,
  input: CreateLeadCaptureInput,
): Promise<{ capture: LeadCapture; token: string }> {
  const { token, secretHash } = newOrganizationToken(actor.organizationId);
  const row = await tx.leadCapture.create({
    data: {
      kind: input.kind,
      name: input.name,
      tokenHash: secretHash,
      settings: settingsOf(input.settings),
      createdBy: actor.userId,
    },
  });
  await recordAudit(tx, actor, {
    action: "capture.added",
    entityType: "lead_capture",
    entityId: row.id,
    after: { kind: input.kind, name: input.name },
  });
  return { capture: captureOf(row), token };
}

export async function updateForm(
  tx: OrgTx,
  actor: Actor,
  input: { id: string; name: string; settings: FormSettings },
): Promise<LeadCapture> {
  const found = await tx.leadCapture.findUnique({ where: { id: input.id } });
  if (!found) throw notFound();
  const row = await tx.leadCapture.update({
    where: { id: input.id },
    data: { name: input.name, settings: input.settings },
  });
  await recordAudit(tx, actor, {
    action: "capture.edited",
    entityType: "lead_capture",
    entityId: row.id,
    before: { name: found.name },
    after: { name: input.name },
  });
  return captureOf(row);
}

export async function setCaptureDisabled(tx: OrgTx, actor: Actor, id: string, disabled: boolean): Promise<void> {
  const found = await tx.leadCapture.findUnique({ where: { id } });
  if (!found) throw notFound();
  await tx.leadCapture.update({ where: { id }, data: { disabledAt: disabled ? new Date() : null } });
  await recordAudit(tx, actor, {
    action: disabled ? "capture.turned-off" : "capture.turned-on",
    entityType: "lead_capture",
    entityId: id,
  });
}

/** A live form or link by its token, with its organization; null for a token that names none, or one switched off. */
export async function findCapture(
  db: Pick<Database, "forOrg">,
  token: string,
): Promise<{ organizationId: string; capture: LeadCapture } | null> {
  const parsed = parseOrganizationToken(token);
  if (parsed === null) return null;
  const row = await db.forOrg(parsed.organizationId, (tx) =>
    tx.leadCapture.findUnique({
      where: { organizationId_tokenHash: { organizationId: parsed.organizationId, tokenHash: parsed.secretHash } },
    }),
  );
  if (row?.disabledAt !== null) return null;
  return { organizationId: parsed.organizationId, capture: captureOf(row) };
}

/**
 * A lead posted to a form or a link: checked as the lead form checks a lead, then brought in. The answer says only
 * whether it was taken (never whose lead it joined), as it goes to whoever posted it.
 */
export async function receiveCaptureLead(
  dependencies: IntakeDependencies,
  token: string,
  body: unknown,
): Promise<IntakeLeadResult> {
  const found = await findCapture(dependencies.db, token);
  if (found === null) return { taken: false, reason: "not_found" };
  const parsed = incomingLead.safeParse(body);
  if (!parsed.success) {
    return {
      taken: false,
      reason: "invalid",
      fields: [...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "")))],
    };
  }
  const outcome = await takeLead(dependencies, found.organizationId, parsed.data, {
    source: found.capture.kind === "form" ? "web_form" : "integration",
    sourceDetail: found.capture.name,
  });
  // A blocked contact is answered as taken: whoever posted it learns nothing from the difference.
  return outcome === null ? { taken: false, reason: "not_set_up" } : { taken: true };
}
