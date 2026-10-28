// Setting a trip up is audited, each change with who made it: created, changed and deleted, and a name already taken is refused.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTripKit, deleteTripKit, updateTripKit } from "../../src/inbox/index.js";
import { auditOf, memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, type TestInbox } from "./support.js";

describe("trip details setup", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("audits creating, changing and deleting a trip, and stops a name used twice", async () => {
    const connection = await aConnectedAgency(test);
    const member = memberOf(connection.organizationId);
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(connection.organizationId, work);
    const trip = {
      name: "Kerala 6 days",
      message: "Itinerary",
      keywords: ["Kerala ", "kerala", "munnar"],
      autoSend: true,
    };
    const { id } = await inOrg((tx) => createTripKit(tx, member, trip));
    // Keywords are kept as they are matched: lower case, trimmed, once each.
    expect((await inOrg((tx) => tx.tripKit.findUniqueOrThrow({ where: { id } }))).keywords).toEqual([
      "kerala",
      "munnar",
    ]);
    await expect(inOrg((tx) => createTripKit(tx, member, trip))).rejects.toMatchObject({
      reason: "TRIP_KIT_NAME_TAKEN",
    });
    await inOrg((tx) => updateTripKit(tx, member, { ...trip, tripKitId: id, name: "Kerala 7 days" }));
    await inOrg((tx) => deleteTripKit(tx, member, id));
    const entries = await auditOf(test, connection.organizationId, id);
    expect(entries.map((entry) => entry.action)).toEqual([
      "inbox.trip-kit-created",
      "inbox.trip-kit-changed",
      "inbox.trip-kit-deleted",
    ]);
    expect(entries.every((entry) => entry.actorUserId === member.userId)).toBe(true);
    expect(entries[1]).toMatchObject({ before: { name: "Kerala 6 days" }, after: { name: "Kerala 7 days" } });
    // A deleted trip is gone from the live names: the name may be used again.
    await inOrg((tx) => createTripKit(tx, member, { ...trip, name: "Kerala 7 days" }));
  });
});
