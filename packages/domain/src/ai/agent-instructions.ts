// The owner's own instructions to the AI agent on how to talk ("No emojis", "Never repeat yourself"): added, changed and
// removed one at a time, each audited by its length alone, never its words. Both agents read them before writing.
import {
  addAgentInstructionInput,
  AGENT_INSTRUCTIONS_MAX,
  removeAgentInstructionInput,
  updateAgentInstructionInput,
  type AddAgentInstructionInput,
  type AgentInstruction,
  type RemoveAgentInstructionInput,
  type UpdateAgentInstructionInput,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const inOrder = [{ createdAt: "asc" as const }, { id: "asc" as const }];
const columns = { id: true, text: true, updatedAt: true } as const;

const shown = (row: { id: string; text: string; updatedAt: Date }): AgentInstruction => ({
  id: row.id,
  text: row.text,
  updatedAt: row.updatedAt.toISOString(),
});

/** Every instruction, oldest first: the order the owner added them, which is the order the agent reads them. */
export async function agentInstructionsOf(tx: OrgTx): Promise<AgentInstruction[]> {
  return (await tx.aiAgentInstruction.findMany({ select: columns, orderBy: inOrder })).map(shown);
}

/** The instructions' words alone, for a prompt. */
export async function agentInstructionTextsOf(tx: OrgTx): Promise<string[]> {
  return (await tx.aiAgentInstruction.findMany({ select: { text: true }, orderBy: inOrder })).map((row) => row.text);
}

const invalid = () => new DomainError("VALIDATION", "INVALID_INSTRUCTION", "An instruction needs 1 to 200 characters.");

export async function addAgentInstruction(
  tx: OrgTx,
  access: MemberAccess,
  input: AddAgentInstructionInput,
): Promise<AgentInstruction> {
  const checked = addAgentInstructionInput.safeParse(input);
  if (!checked.success) throw invalid();
  // Two adds at once may both pass this count: the limit keeps the prompt short, it is no safety rule.
  if ((await tx.aiAgentInstruction.count()) >= AGENT_INSTRUCTIONS_MAX) {
    throw new DomainError("LIMIT_REACHED", "TOO_MANY_INSTRUCTIONS", "The agent can keep at most 20 instructions.");
  }
  const row = await tx.aiAgentInstruction.create({
    data: { text: checked.data.text, createdBy: access.userId },
    select: columns,
  });
  await recordAudit(tx, access, {
    action: "ai-agent.instruction-added",
    entityType: "ai_agent_instruction",
    entityId: row.id,
    after: { length: row.text.length },
  });
  return shown(row);
}

export async function updateAgentInstruction(
  tx: OrgTx,
  access: MemberAccess,
  input: UpdateAgentInstructionInput,
): Promise<AgentInstruction> {
  const checked = updateAgentInstructionInput.safeParse(input);
  if (!checked.success) throw invalid();
  const { id, text } = checked.data;
  const before = await tx.aiAgentInstruction.findFirst({ where: { id }, select: columns });
  if (before === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "This instruction no longer exists.");
  const row = await tx.aiAgentInstruction.update({
    where: { id },
    data: { text, updatedBy: access.userId },
    select: columns,
  });
  await recordAudit(tx, access, {
    action: "ai-agent.instruction-changed",
    entityType: "ai_agent_instruction",
    entityId: id,
    before: { length: before.text.length },
    after: { length: row.text.length },
  });
  return shown(row);
}

export async function removeAgentInstruction(
  tx: OrgTx,
  access: MemberAccess,
  input: RemoveAgentInstructionInput,
): Promise<void> {
  const checked = removeAgentInstructionInput.safeParse(input);
  if (!checked.success) throw new DomainError("NOT_FOUND", "NOT_FOUND", "This instruction no longer exists.");
  const { id } = checked.data;
  const before = await tx.aiAgentInstruction.findFirst({ where: { id }, select: columns });
  if (before === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "This instruction no longer exists.");
  await tx.aiAgentInstruction.delete({ where: { id } });
  await recordAudit(tx, access, {
    action: "ai-agent.instruction-removed",
    entityType: "ai_agent_instruction",
    entityId: id,
    before: { length: before.text.length },
  });
}
