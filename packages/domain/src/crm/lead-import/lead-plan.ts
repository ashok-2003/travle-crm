// Planning a lead file's rows (spec B15, B16, B25, B33): what the add would do with each row, from one set of lookups
// for the whole file and the rows before it. People and leads an earlier row of the same file makes count for the
// rows after it, so two rows for one person become a new lead and a repeat enquiry on it. A forecast: the add applies
// the rules again, row by row, to the database as it is then.
import { isOpenStage, type ContactKind, type LeadStage } from "@travel-crm/contracts/crm";
import type { RowReason } from "@travel-crm/contracts/imports";
import { fingerprintHex, rowFingerprint, type ImportRowPlan } from "../../imports/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import type { LeadLookups } from "./lead-lookups.js";
import type { LeadRowContacts, LeadRowReading } from "./lead-row.js";

const KINDS: readonly { kind: ContactKind; key: keyof LeadRowContacts }[] = [
  { kind: "phone", key: "phone" },
  { kind: "email", key: "email" },
  { kind: "instagram", key: "instagramHandle" },
];

/** A person as the plan follows them through the file: their contacts, and whether their leads are open. */
interface PlannedPerson {
  id: string;
  contacts: LeadRowContacts;
  open: boolean;
  hasLead: boolean;
  /** Whether the database had a lead for them before the file (a Google Sheet's in_crm), and whether it was open. */
  leadBeforeFile: "none" | "closed" | "open";
}

export interface PlanContext {
  timeZone: string;
  /** A Google Sheet's rows for people who already have a lead are planned in_crm (the Sheets sync). */
  fromSheet: boolean;
}

export type PlannableRow = LeadRowReading & { rowNumber: number };

const onlyKey = (contacts: LeadRowContacts, key: keyof LeadRowContacts): LeadRowContacts => ({
  phone: null,
  email: null,
  instagramHandle: null,
  [key]: contacts[key],
});

/** Plans every row, in order. `earlier` is when other imports added each fingerprint. */
export function planLeadRows(
  rows: readonly PlannableRow[],
  lookups: LeadLookups,
  earlier: ReadonlyMap<string, Date>,
  context: PlanContext,
): { plans: ImportRowPlan[]; rowsToAdd: number; rowsNewStage: number } {
  const plans: ImportRowPlan[] = [];
  const seenFingerprints = new Map<string, number>();
  const people = new Map<string, PlannedPerson>();
  // Who holds a contact among the people this file made or filled; the database holds the rest.
  const heldInFile = new Map<string, PlannedPerson>();
  let rowsToAdd = 0;
  let rowsNewStage = 0;

  const planned = (stored: { id: string; contacts: LeadRowContacts }): PlannedPerson => {
    const found = people.get(stored.id);
    if (found !== undefined) return found;
    const open = lookups.openLeadOf(stored.id) !== null;
    const person: PlannedPerson = {
      id: stored.id,
      contacts: { ...stored.contacts },
      open,
      hasLead: lookups.hasLead(stored.id),
      leadBeforeFile: open ? "open" : lookups.hasLead(stored.id) ? "closed" : "none",
    };
    people.set(stored.id, person);
    return person;
  };
  /** Who holds this one contact: a person this file made, else one the database has. */
  const holderOf = (contacts: LeadRowContacts, kind: ContactKind, key: keyof LeadRowContacts) => {
    const value = contacts[key];
    if (value === null) return null;
    const inFile = heldInFile.get(`${kind}:${value}`);
    if (inFile !== undefined) return inFile;
    const stored = lookups.personOf(onlyKey(contacts, key));
    return stored === null ? null : planned(stored);
  };
  /** The person a row's contacts belong to: the phone's, else the email's, else the handle's (R4). */
  const personOf = (contacts: LeadRowContacts): PlannedPerson | null => {
    for (const { kind, key } of KINDS) {
      const holder = holderOf(contacts, kind, key);
      if (holder !== null) return holder;
    }
    return null;
  };
  /** Gives the person each contact they lack, unless another person holds it (R32). */
  const fillContacts = (person: PlannedPerson, contacts: LeadRowContacts) => {
    for (const { kind, key } of KINDS) {
      const value = contacts[key];
      if (value === null || person.contacts[key] !== null) continue;
      const holder = holderOf(contacts, kind, key);
      if (holder !== null && holder.id !== person.id) continue;
      person.contacts[key] = value;
      heldInFile.set(`${kind}:${value}`, person);
    }
  };
  /** A lead the file makes for the person: open unless imported Won or Lost. */
  const madeLead = (person: PlannedPerson, stage: LeadStage) => {
    person.hasLead = true;
    person.open = isOpenStage(stage);
  };

  for (const row of rows) {
    const { rowNumber } = row;
    if (row.kind === "not_added") {
      plans.push({
        rowNumber,
        plan: "not_added",
        reasons: row.reasons,
        noted: false,
        newDestination: null,
        exampleName: row.exampleName,
        exampleValue: row.exampleValue,
      });
      continue;
    }
    const fingerprint = fingerprintHex(rowFingerprint("leads", row.fingerprintValues));
    const same = seenFingerprints.get(fingerprint);
    if (same === undefined) seenFingerprints.set(fingerprint, rowNumber);
    const base = {
      rowNumber,
      noted: row.noted,
      newDestination: null,
      exampleName: row.exampleName,
      exampleValue: null,
    };
    if (same !== undefined) {
      plans.push({ ...base, plan: "not_added", reasons: [{ code: "same_as_row", row: same }], noted: false });
      continue;
    }
    if (lookups.isBlocked(row.contacts)) {
      plans.push({ ...base, plan: "blocked", reasons: [{ code: "blocked" }] });
      continue;
    }
    const addedAt = earlier.get(fingerprint);
    if (addedAt !== undefined) {
      const on = calendarDateIn(addedAt, context.timeZone);
      plans.push({ ...base, plan: "already_imported", reasons: [{ code: "already_imported", on }] });
      continue;
    }
    const person = personOf(row.contacts);
    if (context.fromSheet && person !== null && person.leadBeforeFile !== "none") {
      const reason: RowReason = { code: person.leadBeforeFile === "open" ? "in_crm_open" : "in_crm_closed" };
      plans.push({ ...base, plan: "in_crm", reasons: [reason] });
      continue;
    }
    const plan = person === null ? "new" : person.open ? "enquiry" : person.hasLead ? "returning" : "new";
    if (person === null) {
      const created: PlannedPerson = {
        id: `row-${String(rowNumber)}`,
        contacts: { ...row.contacts },
        open: false,
        hasLead: false,
        leadBeforeFile: "none",
      };
      for (const { kind, key } of KINDS) {
        const value = row.contacts[key];
        if (value !== null) heldInFile.set(`${kind}:${value}`, created);
      }
      madeLead(created, row.stage);
    } else {
      fillContacts(person, row.contacts);
      if (plan !== "enquiry") madeLead(person, row.stage);
    }
    rowsToAdd += 1;
    if (plan !== "enquiry" && row.stage === "new") rowsNewStage += 1;
    const newDestination =
      row.destinationName !== null && !lookups.hasDestination(row.destinationName) ? row.destinationName : null;
    plans.push({ ...base, plan, reasons: [], newDestination });
  }
  return { plans, rowsToAdd, rowsNewStage };
}
