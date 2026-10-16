// Rows for other tests' setup, written straight into the tables: a person, a lead and a task, with no rule, audit
// entry or event. A test of a rule calls the module's own function instead.
import type { LeadStage } from "@travel-crm/contracts/crm";
import type { TaskKind } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";

let nextPhone = Math.floor(Math.random() * 90_000_000);

/** An Indian mobile number no other seed of this test run has used. */
export function freshPhone(): string {
  nextPhone += 1;
  return `+9198${String(nextPhone).padStart(8, "0")}`;
}

export interface PersonSeed {
  name?: string;
  phoneE164?: string | null;
  email?: string | null;
  instagramHandle?: string | null;
  createdBy?: string | null;
}

/** A person, Rahul Sharma with a fresh phone unless told otherwise. */
export async function aPerson(tx: OrgTx, overrides: PersonSeed = {}): Promise<{ id: string; name: string }> {
  return tx.person.create({
    data: { name: "Rahul Sharma", phoneE164: freshPhone(), ...overrides },
    select: { id: true, name: true },
  });
}

export interface LeadSeed {
  personId?: string;
  stage?: LeadStage;
  reopenStage?: LeadStage | null;
  ownerUserId?: string | null;
  destinationId?: string | null;
  source?: string;
  returning?: boolean;
  travelKind?: string;
  travelMonth?: Date | null;
  adults?: number | null;
  childrenAges?: number[];
  budgetPaise?: bigint | null;
  budgetBasis?: string | null;
  tripType?: string | null;
  firstReplyAt?: Date | null;
  stageChangedAt?: Date;
  createdBy?: string | null;
  createdAt?: Date;
}

/** A lead in New from a phone call, for a new person unless given one. */
export async function aLead(tx: OrgTx, overrides: LeadSeed = {}): Promise<{ id: string; personId: string }> {
  const personId = overrides.personId ?? (await aPerson(tx)).id;
  return tx.lead.create({
    data: { source: "phone_call", ...overrides, personId },
    select: { id: true, personId: true },
  });
}

export interface TaskSeed {
  kind?: TaskKind;
  title?: string;
  dueAt?: Date;
  assigneeUserId?: string | null;
  record?: { recordType: string; recordId: string } | null;
  doneAt?: Date | null;
  doneBy?: string | null;
  cancelledAt?: Date | null;
  createdBy?: string | null;
}

/** An open task due in an hour, linked to nothing unless told otherwise; a follow-up needs a record. */
export async function aTask(tx: OrgTx, overrides: TaskSeed = {}): Promise<{ id: string }> {
  const { record, dueAt = new Date(Date.now() + 60 * 60 * 1000), ...rest } = overrides;
  return tx.task.create({
    data: {
      kind: "task",
      title: "Call back",
      ...rest,
      dueAt,
      firstDueAt: dueAt,
      recordType: record?.recordType ?? null,
      recordId: record?.recordId ?? null,
    },
    select: { id: true },
  });
}
