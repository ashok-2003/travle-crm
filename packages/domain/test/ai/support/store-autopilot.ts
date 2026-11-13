// Writes the autopilot row a test needs straight to the table: no screen saves it any more, so tests set what the agent reads.
import type { OrgTx } from "@travel-crm/db";
import type { AutopilotRow } from "../../../src/ai/autopilot.js";

export async function storeAutopilot(tx: OrgTx, organizationId: string, fields: Partial<AutopilotRow>): Promise<void> {
  await tx.aiAutopilot.upsert({ where: { organizationId }, create: { organizationId, ...fields }, update: fields });
}
