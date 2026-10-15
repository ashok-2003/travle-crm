// Removing a member forgets their browsers (ADR 0007, ADR 0014): the listener of staff.removed deletes that person's
// push subscriptions in the event's organization, and running it again for the same removal changes nothing.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../src/jobs/index.js";
import { forgetPushSubscriptionsListener } from "../../src/notifications/index.js";
import { useDeliveryKit } from "./delivery-kit.js";

describe("forgetting a removed member's browsers", () => {
  const kit = useDeliveryKit("Forget push subscriptions");

  /** The event identity's removeStaff publishes, as the worker hands it to the listener. */
  const staffRemoved = (userId: string): DomainEvent => ({
    id: randomUUID(),
    organizationId: kit.organizationId,
    type: "staff.removed",
    payload: { memberId: randomUUID(), userId },
    occurredAt: new Date(),
  });
  const browsersOf = (userIds: string[]) =>
    kit.db.forOrg(kit.organizationId, (tx) =>
      tx.pushSubscription.findMany({ where: { userId: { in: userIds } }, select: { userId: true, endpoint: true } }),
    );

  it("listens for staff.removed on its own queue", () => {
    expect(forgetPushSubscriptionsListener).toMatchObject({
      name: "notifications.forget-push-subscriptions",
      eventType: "staff.removed",
    });
  });

  it("deletes every subscription of the person removed, and no one else's", async () => {
    const leaving = kit.addMember("leaving@example.test");
    const staying = kit.addMember("staying@example.test");
    await kit.subscribe(leaving, "leaving-phone");
    await kit.subscribe(leaving, "leaving-laptop");
    const kept = await kit.subscribe(staying, "staying-phone");

    await forgetPushSubscriptionsListener.handle(staffRemoved(leaving), kit.context());

    expect(await browsersOf([leaving, staying])).toEqual([{ userId: staying, endpoint: kept }]);
  });

  it("changes nothing when it runs again for the same removal", async () => {
    const leaving = kit.addMember(null);
    await kit.subscribe(leaving, "shared-tablet");
    const event = staffRemoved(leaving);

    await forgetPushSubscriptionsListener.handle(event, kit.context());
    await expect(forgetPushSubscriptionsListener.handle(event, kit.context())).resolves.toBeUndefined();

    expect(await browsersOf([leaving])).toEqual([]);
  });

  it("refuses an event that doesn't carry the two ids, and deletes nothing", async () => {
    const leaving = kit.addMember(null);
    const kept = await kit.subscribe(leaving, "not-yet");
    const malformed = { ...staffRemoved(leaving), payload: { userId: "someone" } };
    // The contract's check: memberId is missing and userId is not a UUID.
    await expect(forgetPushSubscriptionsListener.handle(malformed, kit.context())).rejects.toMatchObject({
      name: "ZodError",
      issues: [
        expect.objectContaining({ path: ["memberId"], code: "invalid_type" }),
        expect.objectContaining({ path: ["userId"], format: "uuid" }),
      ],
    });
    expect(await browsersOf([leaving])).toEqual([{ userId: leaving, endpoint: kept }]);
  });
});
