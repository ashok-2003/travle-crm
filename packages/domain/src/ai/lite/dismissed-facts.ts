// A person's "Not right" on a value the AI filled reaches the lite agent's memory too: the facts the lead's chats settled
// for that value are let go, so the next turn asks for it again instead of pricing and booking on what was dismissed.
import { liteFacts, type LiteFacts, type SuggestedLeadField } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { lockChat } from "../../inbox/index.js";

/** The facts each lead field rests on; a price told rests on the trip, the day and the party, so it goes with them. */
const factsOf: Partial<Record<SuggestedLeadField, readonly (keyof LiteFacts)[]>> = {
  destination: ["packageId", "departureId", "quoted"],
  when: ["day", "month", "departureId", "quoted"],
  adults: ["adults", "quoted"],
  children_ages: ["children", "quoted"],
  departure_city: ["pickupCity"],
  room_type: ["roomType", "quoted"],
};

/**
 * The chats whose lite facts were settled for this lead, locked in a fixed order. Called before the lead is locked: a
 * turn takes the chat's lock and then the lead's, and so must everything that takes both.
 */
export async function lockChatsOfLead(tx: OrgTx, leadId: string): Promise<string[]> {
  const rows = await tx.aiChat.findMany({
    where: { facts: { path: ["leadId"], equals: leadId } },
    orderBy: { conversationId: "asc" },
    select: { conversationId: true },
  });
  for (const row of rows) await lockChat(tx, row.conversationId);
  return rows.map((row) => row.conversationId);
}

/** Lets go the facts `fields` rest on, in these chats (locked by lockChatsOfLead) while they are still the lead's. */
export async function forgetDismissedFacts(
  tx: OrgTx,
  input: { leadId: string; conversationIds: readonly string[]; fields: readonly SuggestedLeadField[] },
): Promise<void> {
  const keys = new Set(input.fields.flatMap((field) => factsOf[field] ?? []));
  if (keys.size === 0) return;
  const cleared = Object.fromEntries([...keys].map((key) => [key, null]));
  for (const conversationId of input.conversationIds) {
    // Read again under the chat's lock: a turn may have settled them for another lead meanwhile.
    const row = await tx.aiChat.findFirst({ where: { conversationId }, select: { id: true, facts: true } });
    const facts = liteFacts.safeParse(row?.facts ?? {});
    if (row === null || !facts.success || facts.data.leadId !== input.leadId) continue;
    await tx.aiChat.update({ where: { id: row.id }, data: { facts: liteFacts.parse({ ...facts.data, ...cleared }) } });
  }
}
