// The demo agency's assignment (release 4, spec 8), built inside the nightly reset's transaction: leads go in turns
// between the Owner and the salesperson, a Kashmir enquiry to the salesperson by rule, answered by the working week at
// its 15-minute limit, and two new leads nobody could take wait in Unassigned, so the queue and its notice show on the
// demo. Built through the cores the screens use; nobody is notified.
import {
  DEFAULT_CLOSES_MINUTE,
  DEFAULT_OPENS_MINUTE,
  DEFAULT_SLOW_REPLY_MINUTES,
  MONDAY_TO_SATURDAY,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { findOrAddDestination } from "../../catalog/index.js";
import type { Actor } from "../../kernel/index.js";
import { addLeadInTransaction } from "../add-lead.js";
import { addPerson } from "../people.js";

const HOUR_MS = 60 * 60 * 1000;

/** Two enquiries that came in by themselves (not through the website form, whose demo leads are counted apart), found no one in the pool available, and wait for a manager. */
const WAITING = [
  { name: "Aditi Verma", email: "aditi.verma@example.com", source: "referral", hoursAgo: 3 },
  { name: "Harsh Vora", instagramHandle: "harsh.vora.trips", source: "instagram", hoursAgo: 1 },
] as const;

export async function addDemoAssignment(
  tx: OrgTx,
  actor: Actor,
  staff: { ownerUserId: string; salesUserId: string },
  now: Date,
): Promise<void> {
  const kashmir = await findOrAddDestination(tx, actor, "Kashmir");
  await tx.assignmentSettings.create({
    data: {
      mode: "turns",
      slowReplyMinutes: DEFAULT_SLOW_REPLY_MINUTES,
      workdays: MONDAY_TO_SATURDAY,
      dayOpensMinute: DEFAULT_OPENS_MINUTE,
      dayClosesMinute: DEFAULT_CLOSES_MINUTE,
    },
  });
  await tx.assignmentPoolMember.createMany({
    data: [{ userId: staff.ownerUserId }, { userId: staff.salesUserId }],
  });
  await tx.assignmentRule.create({
    data: { position: 0, destinationId: kashmir.id, assigneeUserId: staff.salesUserId },
  });
  for (const { hoursAgo, source, ...person } of WAITING) {
    const { id: personId } = await addPerson(tx, actor, person);
    await addLeadInTransaction(
      tx,
      actor,
      {
        personId,
        trip: {
          when: { kind: "unknown" },
          adults: null,
          childrenAges: [],
          budget: null,
          departureCity: null,
          tripType: null,
          hotelCategory: null,
          food: null,
          roomType: null,
          destinationId: null,
        },
        returning: false,
        ownerUserId: null,
        assignedBy: { reason: "none", rulePosition: null, away: false },
        source,
        sourceDetail: null,
        note: null,
        createdBy: null,
        createdAt: new Date(now.getTime() - hoursAgo * HOUR_MS),
      },
      now,
    );
  }
}
