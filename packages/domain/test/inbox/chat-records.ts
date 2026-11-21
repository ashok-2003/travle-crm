// Rows for other tests' setup, written straight into the tables as crm's support/records.ts does: a chat with a
// person on the agency's WhatsApp number (made once), and a message in it. A test of a rule calls the module instead.
import type { OrgTx } from "@travel-crm/db";
import { freshPhone } from "../crm/support/records.js";

/** The agency's number, made the first time a chat needs one. */
async function connectionOf(tx: OrgTx): Promise<string> {
  const found = await tx.whatsappConnection.findFirst({ select: { id: true } });
  if (found !== null) return found.id;
  const digits = freshPhone().replace("+", "");
  const made = await tx.whatsappConnection.create({
    data: { integratedNumber: digits, displayNumber: `+${digits}`, mode: "new_number", status: "connected" },
    select: { id: true },
  });
  return made.id;
}

/** A chat with the person, open and waiting for nothing unless told otherwise. */
export async function aChat(
  tx: OrgTx,
  personId: string | null,
  overrides: { needsReply?: boolean; state?: string; hidden?: boolean } = {},
): Promise<string> {
  const chat = await tx.whatsappConversation.create({
    data: { connectionId: await connectionOf(tx), phoneE164: freshPhone(), personId, ...overrides },
    select: { id: true },
  });
  return chat.id;
}

export interface MessageSeed {
  direction?: "in" | "out";
  origin?: string;
  status?: string;
  clientToken?: string | null;
  occurredAt?: Date;
}

/** A text message: one a member sent from the inbox and that went, unless told otherwise. */
export async function aMessage(tx: OrgTx, conversationId: string, overrides: MessageSeed = {}): Promise<string> {
  const direction = overrides.direction ?? "out";
  const message = await tx.whatsappMessage.create({
    data: {
      conversationId,
      direction,
      origin: direction === "in" ? "customer" : "staff_crm",
      kind: "text",
      body: "Hello",
      status: direction === "in" ? "received" : "sent",
      occurredAt: new Date(),
      ...overrides,
    },
    select: { id: true },
  });
  return message.id;
}
