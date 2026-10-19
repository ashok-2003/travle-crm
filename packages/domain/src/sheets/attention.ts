// A sheet that stops needing rows read (S39, S40, S15, S34, S45): lost access, a missing tab, missing columns, a connector
// who can no longer manage lead sources. Entering one records the change once, by the system, and publishes
// sheet.attention for the one notice to the Owner; coming back to running is recorded and told to nobody.
import type { AttentionState } from "@travel-crm/contracts/sheets";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { sheetAttentionEvent } from "@travel-crm/contracts/sheets";
import { defineListener, type EventListener, publishEvent } from "../jobs/index.js";
import { notify } from "../notifications/index.js";
import type { SheetsJobDependencies } from "./job-dependencies.js";
import { sheetOf } from "./connection-row.js";
import { systemActor } from "../kernel/index.js";
import type { SheetConnectionRow } from "./connection-row.js";

/** What entering each state records (the audit log screen reads these action words from this type). */
const entered: Record<
  AttentionState,
  { action: "sheet.access-lost" | "sheet.tab-missing" | "sheet.columns-missing" | "sheet.needs-manager" }
> = {
  lost_access: { action: "sheet.access-lost" },
  tab_missing: { action: "sheet.tab-missing" },
  columns_missing: { action: "sheet.columns-missing" },
  needs_manager: { action: "sheet.needs-manager" },
};

/**
 * Moves the sheet into the attention state, records it by the system actor, and publishes sheet.attention (the notice)
 * and sheet.schedule-changed (it keeps being checked, so sharing again fixes it). False, and nothing recorded, when it
 * is in that state already: the same state twice notifies once (S45).
 */
export async function enterAttention(
  tx: OrgTx,
  input: { sheet: Pick<SheetConnectionRow, "id" | "organizationId" | "status">; state: AttentionState; now: Date },
): Promise<boolean> {
  const { sheet, state, now } = input;
  if (sheet.status === state) return false;
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { status: state, attentionSince: now, checkStartedAt: null },
  });
  await recordAudit(tx, systemActor(sheet.organizationId), {
    action: entered[state].action,
    entityType: "sheet_connection",
    entityId: sheet.id,
    after: { status: state },
  });
  await publishEvent(tx, { type: "sheet.attention", payload: { sheetId: sheet.id, state } });
  await publishEvent(tx, { type: "sheet.schedule-changed", payload: { sheetId: sheet.id } });
  return true;
}

/** What leaving a state records: access restored for lost access, a plain recovery for the others. */
const left: Record<AttentionState, { action: "sheet.access-restored" | "sheet.recovered" }> = {
  lost_access: { action: "sheet.access-restored" },
  tab_missing: { action: "sheet.recovered" },
  columns_missing: { action: "sheet.recovered" },
  needs_manager: { action: "sheet.recovered" },
};

const attentionStates: ReadonlySet<string> = new Set([
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
]);

/**
 * Back to running after a check succeeds (S39): one audit entry by the system, no notice. Nothing when the sheet was
 * not in an attention state.
 */
export async function leaveAttention(
  tx: OrgTx,
  sheet: Pick<SheetConnectionRow, "id" | "organizationId" | "status">,
): Promise<boolean> {
  if (!attentionStates.has(sheet.status)) return false;
  const state = sheet.status as AttentionState;
  await tx.sheetConnection.update({
    where: { id: sheet.id },
    data: { status: "running", attentionSince: null, consecutiveFailures: 0 },
  });
  await recordAudit(tx, systemActor(sheet.organizationId), {
    action: left[state].action,
    entityType: "sheet_connection",
    entityId: sheet.id,
    after: { status: "running" },
  });
  return true;
}

/** What the Owner reads for each state (spec 8): what happened, and what to do. Titles may name the sheet, as the spec shows. */
function wordsFor(
  state: AttentionState,
  sheet: Pick<SheetConnectionRow, "sheetTitle" | "tabTitle">,
  facts: { address: string | null; connector: string | null },
): { title: string; body: string } {
  const name = `'${sheet.sheetTitle.slice(0, 80)}'`;
  switch (state) {
    case "lost_access":
      return {
        title: `We can't open your sheet ${name}`,
        body: facts.address === null ? "Share it with us again." : `Share it with ${facts.address} again.`,
      };
    case "tab_missing":
      return {
        title: `The tab '${sheet.tabTitle.slice(0, 60)}' isn't in ${name} any more`,
        body: "Choose another tab on the sheet's page.",
      };
    case "columns_missing":
      return {
        title: `Columns are missing from ${name}`,
        body: "Put them back, or match other columns on the sheet's page.",
      };
    case "needs_manager":
      return {
        title: `${facts.connector ?? "Whoever connected this sheet"} can't manage lead sources any more`,
        body: `Take over ${name} to keep it running.`,
      };
  }
}

/**
 * sheets.notify-attention: on sheet.attention, the agency Owner is told once for the change into the state (S45), even when
 * someone else connected the sheet; the event's id is the notice's source, so a repeat adds nothing. A sheet that has left
 * the state by the time the listener runs is not told.
 */
export function attentionListener(dependencies: Pick<SheetsJobDependencies, "identity" | "google">): EventListener {
  return defineListener({
    name: "sheets.notify-attention",
    eventType: "sheet.attention",
    payload: sheetAttentionEvent,
    handle: async (event, context) => {
      const { sheetId, state } = event.payload;
      const sheet = await context.forOrg((tx) => sheetOf(tx, sheetId));
      if (sheet?.status !== state) return;
      const { organizationId } = sheet;
      const owner = await dependencies.identity.firstOwner(organizationId);
      if (owner === null) return;
      const connector =
        state === "needs_manager"
          ? ((await dependencies.identity.memberContacts(organizationId, [sheet.connectedBy]))[0]?.name ?? null)
          : null;
      const address = dependencies.google?.accounts()[sheet.serviceAccountIndex]?.email ?? null;
      const words = wordsFor(state, sheet, { address, connector });
      await context.forOrg((tx) =>
        notify(tx, context.actor, {
          recipientUserIds: [owner],
          sourceEventId: event.id,
          kind: "sheet.needs-attention",
          title: words.title,
          body: words.body,
          link: `/settings/lead-sources/sheets/${sheet.id}`,
          channels: ["push"],
        }),
      );
    },
  });
}
