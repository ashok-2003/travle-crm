// What the AI has learned, as stored: the lessons the earlier agent uses in every chat (nothing shows or changes them now).
import type { OrgTx } from "@travel-crm/db";

/** Lessons a prompt carries at most, best supported first. */
const LESSONS_IN_PROMPT = 15;

/** The active lessons as lines for the autopilot's prompt. */
export async function activeLessons(tx: OrgTx): Promise<string[]> {
  const rows = await tx.aiLearning.findMany({
    where: { state: "active" },
    orderBy: [{ evidence: "desc" }, { updatedAt: "desc" }],
    take: LESSONS_IN_PROMPT,
    select: { kind: true, text: true },
  });
  return rows.map((row) => `(${row.kind}) ${row.text}`);
}
