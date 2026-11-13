// Writes the autopilot row a test needs straight to the table: no screen saves it any more, so tests set what the agent reads.
import type { OrgTx } from "@travel-crm/db";

interface Fields {
  autopilot?: boolean;
  agentName?: string;
  tone?: string;
  maxRepliesPerDay?: number;
  strictRules?: string;
  paymentDetails?: string;
}

export async function storeAutopilot(tx: OrgTx, organizationId: string, fields: Fields): Promise<void> {
  await tx.aiAutopilot.upsert({ where: { organizationId }, create: { organizationId, ...fields }, update: fields });
}
