// What the AI sales agent has learned, as stored (the owner, 2026-10-28): the lessons the agent uses in every chat, the
// list the owner reads, and the owner's switch for one (on, off, or dismissed for good). Audited.
import { aiLearningKinds, type AiLearning } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

/** Lessons a prompt carries at most, best supported first. */
const LESSONS_IN_PROMPT = 15;

/** The active lessons as lines for the agent's prompt. */
export async function activeLessons(tx: OrgTx): Promise<string[]> {
  const rows = await tx.aiLearning.findMany({
    where: { state: "active" },
    orderBy: [{ evidence: "desc" }, { updatedAt: "desc" }],
    take: LESSONS_IN_PROMPT,
    select: { kind: true, text: true },
  });
  return rows.map((row) => `(${row.kind}) ${row.text}`);
}

/** Every lesson the owner may see: the active and the turned-off, best supported first. */
export async function listLearnings(tx: OrgTx): Promise<AiLearning[]> {
  const rows = await tx.aiLearning.findMany({
    where: { state: { in: ["active", "off"] } },
    orderBy: [{ evidence: "desc" }, { updatedAt: "desc" }],
    take: 60,
  });
  return rows.map((row) => ({
    id: row.id,
    kind: aiLearningKinds.find((kind) => kind === row.kind) ?? "need",
    text: row.text,
    evidence: row.evidence,
    state: row.state === "off" ? "off" : "active",
    updatedAt: row.updatedAt.toISOString(),
  }));
}

export async function setLearning(
  tx: OrgTx,
  access: MemberAccess,
  input: { learningId: string; state: "active" | "off" | "dismissed" },
): Promise<void> {
  const row = await tx.aiLearning.findFirst({ where: { id: input.learningId }, select: { state: true } });
  if (row === null || row.state === "dismissed") throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  await tx.aiLearning.update({ where: { id: input.learningId }, data: { state: input.state } });
  await recordAudit(tx, access, {
    action: "ai.learning-changed",
    entityType: "ai_learning",
    entityId: input.learningId,
    before: { state: row.state },
    after: { state: input.state },
  });
}
