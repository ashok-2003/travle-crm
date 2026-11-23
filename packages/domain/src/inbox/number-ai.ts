// Each WhatsApp number's own AI switch (spec 2026-11-22 section 8, MN6): the inbox owns the number, so it reads and
// writes the switch; the AI and the keyword trip kits ask it. The switch is ANDed with the agency's: the AI answers in a
// chat only while the agency's switch is on and the chat's number has its own on and isn't disconnected.
import type { SetNumberAnswersInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { connectionById } from "./connection-row.js";

/** The chat's number lets the AI answer: its switch is on and it isn't disconnected (spec section 8). */
export async function numberAnswers(tx: OrgTx, conversationId: string): Promise<boolean> {
  const chat = await tx.whatsappConversation.findUnique({
    where: { id: conversationId },
    select: { connection: { select: { aiAnswers: true, status: true } } },
  });
  return chat?.connection.aiAnswers === true && chat.connection.status !== "disconnected";
}

/** One number's AI on or off: audited; another agency's number, or a disconnected one, is not found. */
export async function setNumberAnswers(tx: OrgTx, access: MemberAccess, input: SetNumberAnswersInput): Promise<void> {
  const connection = await connectionById(tx, input.connectionId);
  if (connection === null || connection.status === "disconnected") {
    throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such WhatsApp number");
  }
  if (connection.aiAnswers === input.on) return;
  await tx.whatsappConnection.update({ where: { id: connection.id }, data: { aiAnswers: input.on } });
  const entry = {
    entityType: "whatsapp_connection",
    entityId: connection.id,
    before: { aiAnswers: connection.aiAnswers },
    after: { aiAnswers: input.on },
  };
  // Each branch names its action as a literal, so the audit test can read every recorded action.
  if (input.on) await recordAudit(tx, access, { action: "whatsapp.number-ai-on", ...entry });
  else await recordAudit(tx, access, { action: "whatsapp.number-ai-off", ...entry });
}
