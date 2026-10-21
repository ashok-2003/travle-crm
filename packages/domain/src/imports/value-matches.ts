// Matching a file's Owner, Stage and Role values (B11, D13): the reader suggests a target for every value of each
// short column, for each of the kind's value fields, so a column re-matched to Owner shows its values at once; the
// check and the add find any value's target, the importer's stored choice first. Identity runs its own transactions,
// so suggestions are made outside the import's and written in it.
import { keyOfWord, MAX_MATCHED_VALUE_LENGTH } from "@travel-crm/contracts/crm";
import type { ImportKind, ValueField, ValueMatchedBy } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import type { ListenerContext } from "../jobs/index.js";
import type { ImportBatchRow } from "./batch-row.js";
import type { ImportIdentity } from "./dependencies.js";

/** A column's position and its listed values (at most 50), for the suggestions. */
export interface ImportColumnValues {
  position: number;
  values: readonly string[];
}

export interface SuggestedMatch {
  field: ValueField;
  value: string;
  target: string | null;
  matchedBy: ValueMatchedBy;
}

/** The fields whose values a kind's file matches one by one. */
export const valueFieldsOf: Readonly<Record<ImportKind, readonly ValueField[]>> = {
  leads: ["owner", "stage"],
  staff: ["role"],
};

type ValueIdentity = Pick<ImportIdentity, "matchLeadWorkers" | "matchRoles">;

/** Each value's automatic target, when it has one: a lead worker, a stage word or a role. */
async function automaticTargets(
  identity: ValueIdentity,
  organizationId: string,
  field: ValueField,
  values: readonly string[],
): Promise<Map<string, { target: string; matchedBy: ValueMatchedBy }>> {
  if (values.length === 0) return new Map();
  switch (field) {
    case "owner": {
      const found = await identity.matchLeadWorkers(organizationId, values);
      return new Map([...found].map(([value, match]) => [value, { target: match.userId, matchedBy: match.matchedBy }]));
    }
    case "role": {
      const found = await identity.matchRoles(organizationId, values);
      // An import never gives the Owner role (B45): an Owner value is never matched to it automatically (M5).
      return new Map(
        [...found]
          .filter(([, match]) => !match.isOwner)
          .map(([value, match]) => [value, { target: match.roleKey, matchedBy: match.matchedBy }]),
      );
    }
    case "stage":
      return new Map(
        values.flatMap((value) => {
          const stage = keyOfWord("stage", value);
          return stage === null ? [] : [[value, { target: stage, matchedBy: "word" as const }] as const];
        }),
      );
  }
}

/** A suggestion for every listed value of every column, for each of the kind's value fields (values over 200 skipped). */
export async function suggestValueMatches(
  identity: ValueIdentity,
  batch: Pick<ImportBatchRow, "organizationId" | "kind">,
  columns: readonly ImportColumnValues[],
): Promise<SuggestedMatch[]> {
  const values = [
    ...new Set(columns.flatMap((column) => column.values).filter((value) => value.length <= MAX_MATCHED_VALUE_LENGTH)),
  ];
  const suggestions: SuggestedMatch[] = [];
  for (const field of valueFieldsOf[batch.kind]) {
    const targets = await automaticTargets(identity, batch.organizationId, field, values);
    for (const value of values) {
      const found = targets.get(value);
      suggestions.push({ field, value, target: found?.target ?? null, matchedBy: found?.matchedBy ?? "none" });
    }
  }
  return suggestions;
}

export async function writeValueMatches(tx: OrgTx, batchId: string, matches: readonly SuggestedMatch[]): Promise<void> {
  await tx.importValueMatch.createMany({ data: matches.map((match) => ({ batchId, ...match })), skipDuplicates: true });
}

/**
 * Each value's target for the field: the stored match (the importer's choice, or the reader's suggestion), else the
 * automatic one (a column of more than fifty values is matched here, value by value), else null for the default.
 */
export async function valueTargetsFor(
  context: Pick<ListenerContext, "forOrg">,
  identity: ValueIdentity,
  batch: Pick<ImportBatchRow, "id" | "organizationId">,
  field: ValueField,
  values: readonly string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(values)];
  const listed = unique.filter((value) => value.length <= MAX_MATCHED_VALUE_LENGTH);
  const stored = await context.forOrg((tx) =>
    tx.importValueMatch.findMany({
      where: { batchId: batch.id, field, value: { in: listed } },
      select: { value: true, target: true },
    }),
  );
  const storedTargets = new Map(stored.map((match) => [match.value, match.target]));
  const automatic = await automaticTargets(
    identity,
    batch.organizationId,
    field,
    unique.filter((value) => !storedTargets.has(value)),
  );
  // A stored null is the importer's choice of the default, or a value the reader found nobody for: it stays null.
  return new Map(
    unique.map((value) => [
      value,
      storedTargets.has(value) ? (storedTargets.get(value) ?? null) : (automatic.get(value)?.target ?? null),
    ]),
  );
}
