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
  refreshRowNumbers,
  contentFingerprint,
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
/** Rows planned to a transaction: their lookups are a handful of queries each of this many values. */
const ROWS_PER_PLANNING = 1_000;

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
  // A full read numbers the rows truly: the ledger's numbers are brought to them (M2).
  if (plan.full) await db.forOrg(organizationId, (tx) => refreshRowNumbers(tx, sheet.id, rows, ledger));
  const unknown = rows.filter((row) => {
    const entry = ledger.get(ledgerKey(row.hash, row.occurrence));
    // A problem hidden by hand is planned again only when someone asks with Sync now or Check again (M7).
    return !isKnown(entry) && !(mode === "scheduled" && entry?.hidden === true);
  });

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
  const items = unknown.map((row) => {
    const reading = readSheetRow(row, context);
    // A row that is no enquiry is known, if it was there at connect, by its cells under their headers (M1).
    return {
      row,
      reading,
      content: reading.kind === "enquiry" ? undefined : contentFingerprint(read.header, row.cells),
    };
  });
  // The lookups are one query a kind, but for a thousand rows at a time: a column inserted into a sheet of twenty thousand
  // rows re-plans them all, and one transaction for them would run past its limit for ever (SD5). The fingerprints met in
  // one chunk are carried to the next, so two equal rows in different chunks are still one.
  const decisions: PlannedRow[] = [];
  const seen = new Set<string>();
  for (let start = 0; start < items.length; start += ROWS_PER_PLANNING) {
    const chunk = items.slice(start, start + ROWS_PER_PLANNING);
    const planned = await db.forOrg(organizationId, async (tx) => {
      const lookups = await lookUpSheetRows(
        tx,
        chunk.map(({ reading }) => reading),
        hashes,
        sheet.id,
        chunk.flatMap(({ content }) => content ?? []),
      );
      return planSheetRows(
        chunk.map(({ row, reading, content }) => ({
          row,
          reading,
          ...(content === undefined ? {} : { contentFingerprint: content }),
          ledger: ledger.get(ledgerKey(row.hash, row.occurrence)),
          mode,
          isErased: (contacts) => lookups.isErased(contacts),
          isBlocked: (contacts) => lookups.lookups.isBlocked(contacts),
          earlier: lookups.earlier,
          baseline: lookups.baseline,
        })),
        seen,
      );
    });
    planned.forEach((decision, index) => {
      const item = chunk[index];
      if (item !== undefined) decisions.push({ row: item.row, decision });
    });
  }
  // Problems fixed, edited or deleted in the sheet clear themselves at the read that covers their place (S31).
  await db.forOrg(organizationId, (tx) =>
    clearVanishedRows(tx, sheet.id, { read: rows, fromRow: plan.fromRow, full: plan.full }),
  );
  const candidates = new Map<string, number>();
  for (const { decision } of decisions) {
    if (decision.kind !== "save") continue;
    const owner = workers.has(decision.reading.ownerUserId) ? decision.reading.ownerUserId : defaultOwnerUserId;
    candidates.set(owner, (candidates.get(owner) ?? 0) + 1);
  }
  return { decisions, workers, defaultOwnerUserId, candidates };
}
