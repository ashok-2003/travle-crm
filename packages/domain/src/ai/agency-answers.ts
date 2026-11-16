// The agency's answers to the AI agent's fixed questions, and the agent's name and tone: facts the owner types, kept on the
// autopilot row. Changes are audited by topic and length, never the words typed in.
import {
  agencyAnswers,
  agentBasics,
  saveAgencyAnswersInput,
  saveAgentBasicsInput,
  agencyQuestionTopics,
  type AgencyAnswers,
  type AgentBasics,
  type SaveAgencyAnswersInput,
  type SaveAgentBasicsInput,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

/** The answers as stored: only the known topics, and an empty answer is absent. */
function cleaned(stored: unknown): AgencyAnswers {
  const parsed = agencyAnswers.safeParse(stored);
  const found = parsed.success ? parsed.data : {};
  const answers: AgencyAnswers = {};
  for (const topic of agencyQuestionTopics) {
    const text = found[topic]?.trim();
    if (text !== undefined && text !== "") answers[topic] = text;
  }
  return answers;
}

export async function agencyAnswersOf(tx: OrgTx): Promise<AgencyAnswers> {
  const row = await tx.aiAutopilot.findFirst({ select: { answers: true } });
  return cleaned(row?.answers);
}

export async function saveAgencyAnswers(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAgencyAnswersInput,
): Promise<AgencyAnswers> {
  const checked = saveAgencyAnswersInput.safeParse(input);
  if (!checked.success) {
    throw new DomainError("VALIDATION", "INVALID_ANSWER", "An answer can be at most 500 characters.");
  }
  const before = await agencyAnswersOf(tx);
  const after = cleaned(checked.data.answers);
  const answers = after as Record<string, string>;
  await tx.aiAutopilot.upsert({
    where: { organizationId: access.organizationId },
    create: { organizationId: access.organizationId, answers, updatedBy: access.userId },
    update: { answers, updatedBy: access.userId },
  });
  const answered = (set: AgencyAnswers) => agencyQuestionTopics.filter((topic) => set[topic] !== undefined);
  await recordAudit(tx, access, {
    action: "ai-agent.answers-changed",
    entityType: "ai_autopilot",
    entityId: access.organizationId,
    before: { answered: answered(before) },
    after: { answered: answered(after) },
  });
  return after;
}

export async function agentBasicsOf(tx: OrgTx): Promise<AgentBasics> {
  const row = await tx.aiAutopilot.findFirst({ select: { agentName: true, tone: true } });
  return row === null ? { agentName: "", tone: "friendly" } : agentBasics.parse(row);
}

/** Writes the name and tone alone: every other autopilot column stays as it was (a new agency gets the column defaults). */
export async function saveAgentBasics(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAgentBasicsInput,
): Promise<AgentBasics> {
  const checked = saveAgentBasicsInput.safeParse(input);
  if (!checked.success) throw new DomainError("VALIDATION", "INVALID_BASICS", "The name or tone isn't valid.");
  const before = await agentBasicsOf(tx);
  const { agentName, tone } = checked.data;
  await tx.aiAutopilot.upsert({
    where: { organizationId: access.organizationId },
    create: { organizationId: access.organizationId, agentName, tone, updatedBy: access.userId },
    update: { agentName, tone, updatedBy: access.userId },
  });
  await recordAudit(tx, access, {
    action: "ai-agent.basics-changed",
    entityType: "ai_autopilot",
    entityId: access.organizationId,
    before: { tone: before.tone, agentNameLength: before.agentName.length },
    after: { tone, agentNameLength: agentName.length },
  });
  return { agentName, tone };
}
