// The demo agency's sample leads (spec 7), built inside the nightly reset's transaction in the demo organization, from
// demo-lead-data.ts: destinations, people, leads with their notes and follow-ups, a blocked number and two standalone
// tasks. Built through the same cores the screens use, so the timeline, the audit log and the events read as they
// would for leads added by hand; nobody is notified.
import type { OrgTx } from "@travel-crm/db";
import { findOrAddDestination } from "../catalog/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { addDays, calendarDateIn, instantAt, parseTimeOfDay, type Actor } from "../kernel/index.js";
import { createTask } from "../tasks/index.js";
import { addBlockedContact } from "./blocking.js";
import { addLeadInTransaction } from "./create-lead.js";
import { DESTINATIONS, PEOPLE, demoLeads } from "./demo-lead-data.js";
import { recordLeadEvent } from "./lead-events.js";
import { addPerson } from "./people.js";

const between = (from: Date, to: Date, part: number) =>
  new Date(from.getTime() + (to.getTime() - from.getTime()) * part);

/** Builds the demo's leads, inside the reset's transaction in the demo organization, as `actor` (the system). */
export async function addDemoLeads(
  tx: OrgTx,
  actor: Actor,
  staff: { ownerUserId: string; salesUserId: string },
  now: Date,
): Promise<void> {
  const timeZone = await organizationTimeZone(tx, actor.organizationId);
  const destinations = new Map<string, string>();
  for (const name of DESTINATIONS) destinations.set(name, (await findOrAddDestination(tx, actor, name)).id);
  const people = new Map<string, string>();
  for (const person of PEOPLE) people.set(person.name, (await addPerson(tx, actor, person)).id);
  const spam = PEOPLE.find((person) => person.name === "Quick Loans Desk");
  if (spam !== undefined) await addBlockedContact(tx, actor, { kind: "phone", value: spam.phone });

  // Oldest first: Today lists new leads in the order they were made.
  const leads = demoLeads(now, timeZone).sort(
    (first, second) => first.createdAt.getTime() - second.createdAt.getTime(),
  );
  for (const lead of leads) {
    const ownerUserId = lead.owner === "owner" ? staff.ownerUserId : staff.salesUserId;
    const trip = {
      when: { kind: "unknown" as const },
      adults: null,
      childrenAges: [],
      budget: null,
      departureCity: null,
      tripType: null,
      hotelCategory: null,
      food: null,
      roomType: null,
      ...lead.trip,
      destinationId: lead.destination === null ? null : (destinations.get(lead.destination) ?? null),
    };
    const { leadId } = await addLeadInTransaction(
      tx,
      actor,
      {
        personId: people.get(lead.person) ?? "",
        trip,
        stage: lead.stage,
        returning: lead.returning ?? false,
        ownerUserId,
        source: lead.source,
        sourceDetail: lead.sourceDetail ?? null,
        note: lead.note ?? null,
        createdBy: null,
        createdAt: lead.createdAt,
      },
      now,
    );
    if (lead.stage !== "new") {
      const occurredAt = between(lead.createdAt, now, 0.4);
      await recordLeadEvent(tx, actor, { leadId, kind: "stage-changed", stage: lead.stage, occurredAt });
    }
    if (lead.followUp !== undefined) {
      const { title, dueAt } = lead.followUp;
      const record = { recordType: "lead", recordId: leadId };
      const task = await createTask(tx, actor, {
        kind: "follow-up",
        title,
        dueAt,
        assigneeUserId: ownerUserId,
        record,
      });
      const added = { recordType: "task", recordId: task.id } as const;
      await recordLeadEvent(tx, actor, {
        leadId,
        kind: "follow-up-added",
        record: added,
        occurredAt: between(lead.createdAt, now, 0.5),
      });
    }
  }
  const today = calendarDateIn(now, timeZone);
  const own = (title: string, days: number, time: string, assigneeUserId: string) =>
    createTask(tx, actor, {
      kind: "task",
      title,
      dueAt: instantAt(addDays(today, days), parseTimeOfDay(time), timeZone),
      assigneeUserId,
      record: null,
    });
  await own("Renew the Goa hotel contracts", 2, "11:00", staff.ownerUserId);
  await own("Update the Kashmir price sheet", 1, "16:00", staff.salesUserId);
}
