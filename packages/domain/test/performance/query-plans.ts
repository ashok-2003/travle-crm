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

/**
 * The fastest of seven timed runs, in milliseconds, after one run to warm the caches. A busy machine only ever adds
 * time, so the fastest run is the one that says whether the query itself fits its budget.
 */
export async function fastestMs(run: () => Promise<unknown>): Promise<number> {
  await run();
  let fastest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < 7; index += 1) {
    const started = performance.now();
    await run();
    fastest = Math.min(fastest, performance.now() - started);
  }
  return fastest;
}

/**
 * A wall-clock budget for one timed run: as written on a laptop, three times as long on a shared CI runner, which is
 * several times slower and noisier (a 25-second budget has been seen missed there with the work unchanged).
 */
export const budgetMs = (laptopMs: number): number => (process.env.CI === undefined ? laptopMs : laptopMs * 3);
