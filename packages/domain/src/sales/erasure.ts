// What sales execution keeps about a person, deleted when the customer is erased (R38): the signals that said they opened
// a quote or asked to book, the run of follow-ups, and every automatic touch (greeting, follow-up, payment reminder) with
// its message id. Run on the platform's transaction, since the runtime role may not delete them.
import type { OrgTx } from "@travel-crm/db";

export async function eraseSalesParts(
  tx: OrgTx,
  input: { organizationId: string; leadIds: readonly string[] },
): Promise<{ signals: number; cadences: number; touches: number }> {
  const signals = await tx.leadSignal.deleteMany({
    where: { organizationId: input.organizationId, leadId: { in: [...input.leadIds] } },
  });
  const cadences = await tx.leadCadence.deleteMany({
    where: { organizationId: input.organizationId, leadId: { in: [...input.leadIds] } },
  });
  const touches = await tx.salesTouch.deleteMany({
    where: { organizationId: input.organizationId, leadId: { in: [...input.leadIds] } },
  });
  return { signals: signals.count, cadences: cadences.count, touches: touches.count };
}
