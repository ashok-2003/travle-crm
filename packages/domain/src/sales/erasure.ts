// What sales execution keeps about a person, deleted when the customer is erased (R38): the signals that said they opened
// a quote or asked to book. Run on the platform's transaction, since the runtime role may not delete them.
import type { OrgTx } from "@travel-crm/db";

export async function eraseSalesParts(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[] },
): Promise<{ signals: number }> {
  const signals = await tx.leadSignal.deleteMany({
    where: { organizationId: input.organizationId, leadId: { in: [...input.leadIds] } },
  });
  return { signals: signals.count };
}
