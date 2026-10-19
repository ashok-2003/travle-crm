// The middle of a check (S19-S24, S29, S31): the rows a read found, which of them are known, how each new one reads as an
// enquiry, and what is to be done with it. The lookups happen once for the whole read, in one query per kind. The
// owners among Owner values are resolved by identity outside any transaction, as an import's are.
import { organizationTimeZone } from "../../identity/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import {
  type CheckDependencies,
  type CheckMode,
  clearVanishedRows,
  type HeaderMatch,
  isKnown,
  ledgerKey,
  lookUpLedger,
  numberRows,
  type ReadPlan,
  sheetOrigin,
  type SheetConnectionRow,
} from "../../sheets/index.js";
import type { SheetRead } from "@travel-crm/integrations/google-sheets";
import { lookUpSheetRows } from "./sheet-lookups.js";
import { planSheetRows } from "./sheet-plan.js";
import { readSheetRow, sheetLeadContext } from "./sheet-rows.js";
import type { PlannedRow } from "./sheet-save.js";

export interface CheckPlan {
  decisions: PlannedRow[];
  /** The agency's lead workers: an owner who is none of them gives the row to the default owner. */
  workers: ReadonlySet<string>;
  defaultOwnerUserId: string;
  /** The rows to save for each owner, for the choice between the usual notices and a summary (S32). */
  candidates: Map<string, number>;
}

const MAX_LISTED_VALUE = 200;

export async function planCheck(
  dependencies: CheckDependencies,
  input: {
    sheet: SheetConnectionRow;
    access: MemberAccess;
    mode: CheckMode;
    read: SheetRead;
    plan: ReadPlan;
    match: HeaderMatch;
    now: Date;
  },
): Promise<CheckPlan> {
  const { db, identity, hashes } = dependencies;
  const { sheet, access, mode, read, plan, match, now } = input;
  const { organizationId } = sheet;
  const rows = numberRows(read.rows);
  const ledger = await db.forOrg(organizationId, (tx) => lookUpLedger(tx, sheet.id, rows, hashes));
  const unknown = rows.filter((row) => !isKnown(ledger.get(ledgerKey(row.hash, row.occurrence))));

  // Who the Owner column's values are: the person's own matches, else identity's, else the agency Owner.
  const ownerValues = [
    ...new Set(
      match.matches.positionsOf("owner").flatMap((position) =>
        unknown.flatMap((row) => {
          const text = (row.cells[position] ?? "").trim();
          return text === "" ? [] : [text];
        }),
      ),
    ),
  ];
  const listed = ownerValues.filter((value) => value.length <= MAX_LISTED_VALUE);
  const chosen = new Map(
    listed.length === 0
      ? []
      : (
          await db.forOrg(organizationId, (tx) =>
            tx.sheetValueMatch.findMany({
              where: { connectionId: sheet.id, field: "owner", value: { in: listed } },
              select: { value: true, target: true },
            }),
          )
        ).map((stored) => [stored.value, stored.target] as const),
  );
  const automatic = await identity.matchLeadWorkers(
    organizationId,
    listed.filter((value) => !chosen.has(value)),
  );
  const workers = new Set((await identity.leadWorkers(organizationId)).map((worker) => worker.userId));
  const targets = new Map<string, string | null>();
  for (const value of ownerValues) {
    const target = chosen.has(value) ? (chosen.get(value) ?? null) : (automatic.get(value)?.userId ?? null);
    targets.set(value, target !== null && workers.has(target) ? target : null);
  }
  const defaultOwnerUserId = (await identity.firstOwner(organizationId)) ?? access.userId;
  const timeZone = await db.forOrg(organizationId, (tx) => organizationTimeZone(tx, organizationId));

  const context = sheetLeadContext({
    header: read.header,
    match,
    ownerTargets: targets,
    defaultOwnerUserId,
    origin: sheetOrigin(sheet),
    today: calendarDateIn(now, timeZone),
    agencyTimeZone: timeZone,
  });
  const items = unknown.map((row) => ({ row, reading: readSheetRow(row, context) }));
  const decisions = await db.forOrg(organizationId, async (tx) => {
    const lookups = await lookUpSheetRows(
      tx,
      items.map(({ reading }) => reading),
      hashes,
    );
    const planned = planSheetRows(
      items.map(({ row, reading }) => ({
        row,
        reading,
        ledger: ledger.get(ledgerKey(row.hash, row.occurrence)),
        mode,
        isErased: (contacts) => lookups.isErased(contacts),
        isBlocked: (contacts) => lookups.lookups.isBlocked(contacts),
        earlier: lookups.earlier,
      })),
    );
    // Problems fixed, edited or deleted in the sheet clear themselves at the read that covers their place (S31).
    await clearVanishedRows(tx, sheet.id, { read: rows, fromRow: plan.fromRow, full: plan.full }, now);
    return planned.flatMap((decision, index) => {
      const item = items[index];
      return item === undefined ? [] : [{ row: item.row, decision }];
    });
  });
  const candidates = new Map<string, number>();
  for (const { decision } of decisions) {
    if (decision.kind !== "save") continue;
    const owner = workers.has(decision.reading.ownerUserId) ? decision.reading.ownerUserId : defaultOwnerUserId;
    candidates.set(owner, (candidates.get(owner) ?? 0) + 1);
  }
  return { decisions, workers, defaultOwnerUserId, candidates };
}
