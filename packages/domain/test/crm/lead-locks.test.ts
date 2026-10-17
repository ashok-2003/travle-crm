// Changes that meet on one lead, or on the destinations its trip names, at the same moment. Every row inserted that
// points at a lead (a timeline entry) and every trip that names a destination takes KEY SHARE on that row, so a lead or
// destination held FOR UPDATE would block it: a change holding the lead while it waits for a task, or a lead, that the
// other change holds would deadlock with it. Each test holds one change open where the other has to wait, then lets it
// go on: both finish, one after the other, and the second sees what the first did.
import { randomUUID } from "node:crypto";
import { addLeadWorkInput, editTripInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  addLeadWork,
  editLeadTrip,
  listLeadTimeline,
  mergeDestinations,
  reassignLead,
  recordLeadEvent,
} from "../../src/crm/index.js";
import { changeLeadOwner } from "../../src/crm/lead-core.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { completeTask } from "../../src/tasks/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";
import { aLead, aTask } from "./support/records.js";

/** A transaction held open after its first step, and the backend that runs it. */
interface Held {
  holder: number;
  /** Lets the transaction take its next step and commit. */
  release: () => void;
  done: Promise<void>;
}

describe("changes that meet on a lead", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  let asha: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const leadRow = (id: string) => inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id } }));
  const kinds = async (leadId: string) =>
    (await inOrg((tx) => listLeadTimeline(tx, manager, { leadId, limit: 50 }))).entries.map((entry) => entry.kind);

  /** Runs `first` in a transaction, then holds it open, uncommitted, until released; `then` runs before it commits. */
  async function holdOpen(first: (tx: OrgTx) => Promise<unknown>, then?: (tx: OrgTx) => Promise<unknown>) {
    let release: () => void = () => undefined;
    const mayGoOn = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: (holder: number) => void = () => undefined;
    const holding = new Promise<number>((resolve) => {
      started = resolve;
    });
    const done = inOrg(async (tx) => {
      await first(tx);
      started(await backendPid(tx));
      await mayGoOn;
      await then?.(tx);
    });
    // A first step that fails leaves nothing held: its error ends the test.
    const holder = await Promise.race([holding, done.then(() => -1)]);
    return { holder, release, done } satisfies Held;
  }

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Lead locks");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    asha = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("finishes a follow-up while a reassign holds its lead: both go through, and the follow-up stays done", async () => {
    const { lead, followUp } = await inOrg(async (tx) => {
      const made = await aLead(tx, { ownerUserId: salesperson.userId });
      const record = { recordType: "lead", recordId: made.id };
      return {
        lead: made,
        followUp: await aTask(tx, { kind: "follow-up", record, assigneeUserId: salesperson.userId }),
      };
    });
    // Done, as tasks.complete runs it: the task first, then "follow-up done" on the lead's timeline.
    const done = await holdOpen(
      (tx) => completeTask(tx, salesperson, followUp.id, new Date()),
      (tx) =>
        recordLeadEvent(tx, salesperson, {
          leadId: lead.id,
          kind: "follow-up-done",
          record: { recordType: "task", recordId: followUp.id },
        }),
    );
    // The reassign holds the lead, then waits for the follow-up Done is changing.
    const reassign = inOrg((tx) =>
      reassignLead(tx, manager, { leadId: lead.id, ownerUserId: asha }, { owners: new Set([asha]), now: new Date() }),
    );
    await waitUntilBlockedBy(platform, done.holder);
    done.release();
    expect((await Promise.allSettled([done.done, reassign])).map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect((await leadRow(lead.id)).ownerUserId).toBe(asha);
    expect(await inOrg((tx) => tx.task.findUniqueOrThrow({ where: { id: followUp.id } }))).toMatchObject({
      assigneeUserId: salesperson.userId,
      doneBy: salesperson.userId,
    });
    expect(await kinds(lead.id)).toEqual(["reassigned", "follow-up-done"]);
  });

  it("gives a follow-up added while a reassign holds the lead to the lead's new owner", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: salesperson.userId }));
    const reassign = await holdOpen((tx) => changeLeadOwner(tx, manager, { leadId: lead.id, ownerUserId: asha }));
    const now = new Date("2026-10-17T05:00:00Z");
    const input = { leadId: lead.id, kind: "follow-up", title: "Call back", due: { on: "2026-10-18", at: "10:00" } };
    const added = inOrg((tx) => addLeadWork(tx, manager, addLeadWorkInput.parse(input), now));
    await waitUntilBlockedBy(platform, reassign.holder);
    reassign.release();
    await reassign.done;
    expect(await added).toMatchObject({ assigneeUserId: asha });
    expect(await kinds(lead.id)).toEqual(["follow-up-added", "reassigned"]);
  });

  it("edits a trip while a merge holds its destinations: both go through, and the trip keeps its edit", async () => {
    const { lead, merged, kept } = await inOrg(async (tx) => {
      const away = await tx.destination.create({ data: { name: "Gulmarg" } });
      const into = await tx.destination.create({ data: { name: "Kashmir" } });
      const made = await aLead(tx, { ownerUserId: salesperson.userId, destinationId: away.id, adults: 2 });
      return { lead: made, merged: away, kept: into };
    });
    const trip = (destinationId: string) =>
      editTripInput.parse({
        leadId: lead.id,
        trip: {
          destination: { kind: "existing", destinationId },
          when: { kind: "unknown" },
          adults: 3,
          childrenAges: [],
          budget: null,
          departureCity: null,
          tripType: null,
          hotelCategory: null,
          food: null,
          roomType: null,
        },
      });
    // The edit holds the lead's row from its first save, then names the destination the merge keeps.
    const edit = await holdOpen(
      (tx) => editLeadTrip(tx, salesperson, trip(merged.id)),
      (tx) => editLeadTrip(tx, salesperson, trip(kept.id)),
    );
    // The merge holds both destinations, then waits for the lead the edit holds.
    const merge = inOrg((tx) =>
      mergeDestinations(tx, manager, { destinationId: merged.id, intoDestinationId: kept.id }),
    );
    await waitUntilBlockedBy(platform, edit.holder);
    edit.release();
    expect((await Promise.allSettled([edit.done, merge])).map((result) => result.status)).toEqual([
      "fulfilled",
      "fulfilled",
    ]);
    expect(await leadRow(lead.id)).toMatchObject({ destinationId: kept.id, adults: 3 });
  });
});
