// What the planner does with a query (R11): EXPLAIN (FORMAT JSON) on the exact composed SQL the code runs, inside the
// caller's transaction, so a plan read in forOrg is the runtime's, under row-level security. Returns the indexes the
// plan reads and the tables it scans from start to end; and times a call, the median of five after a warm-up.
import { sql, type OrgTx, type Sql } from "@travel-crm/db";

export interface QueryPlan {
  /** Every index an index, index-only or bitmap index scan reads. */
  indexes: string[];
  /** Every table read by a sequential scan. */
  seqScans: string[];
  /** The plan as Postgres printed it, for a failure's message. */
  text: string;
}

interface PlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Index Name"?: string;
  Plans?: PlanNode[];
}

function walk(node: PlanNode, into: { indexes: Set<string>; seqScans: Set<string> }): void {
  if (node["Index Name"] !== undefined) into.indexes.add(node["Index Name"]);
  if (node["Node Type"] === "Seq Scan" && node["Relation Name"] !== undefined) into.seqScans.add(node["Relation Name"]);
  for (const child of node.Plans ?? []) walk(child, into);
}

export async function planOf(tx: OrgTx, query: Sql): Promise<QueryPlan> {
  const [row] = await tx.$queryRaw<{ "QUERY PLAN": { Plan: PlanNode }[] }[]>(sql`EXPLAIN (FORMAT JSON) ${query}`);
  const plan = row?.["QUERY PLAN"][0]?.Plan;
  if (plan === undefined) throw new Error("EXPLAIN returned no plan");
  const found = { indexes: new Set<string>(), seqScans: new Set<string>() };
  walk(plan, found);
  return { indexes: [...found.indexes].sort(), seqScans: [...found.seqScans].sort(), text: JSON.stringify(plan) };
}

/** The median of five timed runs, in milliseconds, after one run to warm the caches. */
export async function medianMs(run: () => Promise<unknown>): Promise<number> {
  await run();
  const times: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    await run();
    times.push(performance.now() - started);
  }
  times.sort((first, second) => first - second);
  return times[2] ?? Number.NaN;
}
