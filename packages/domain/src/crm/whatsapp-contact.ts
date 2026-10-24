// A WhatsApp message from a number becomes a lead, joins an open lead's chat, or waits for a button (spec 4.3 I2, Q2):
// the one save path, saveEnquiry, makes the person and lead for a number we don't know; a known person with an open lead
// gets no new lead and no repeat-enquiry row (a chat is not an enquiry per line), only one timeline entry when the thread
// restarts after a quiet day; a past customer whose leads are all closed waits in the inbox for Start a new lead. The
// caller (the inbox module) owns the transaction and holds the conversation's lock.
import { internationalPhone } from "@travel-crm/contracts/kernel";
import type { TripInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { DomainError, type Actor } from "../kernel/index.js";
import { isBlocked } from "./blocking.js";
import { recordLeadEvent } from "./lead-events.js";
import { matchPerson, newestOpenLead } from "./people.js";
import { saveEnquiry, type Enquiry } from "./save-enquiry.js";

/** How long a chat must be quiet for its next message to count as the thread restarting. */
export const QUIET_HOURS = 24;
const MAX_NOTE_LENGTH = 1000;

export interface WhatsAppContact {
  /** The customer's number, E.164. */
  phoneE164: string;
  /** The customer's WhatsApp profile name, if they have one. */
  profileName: string | null;
  /** The first message's words for the lead's note, "Sent a photo" for media; null for none. */
  firstText: string | null;
  /** The message's own time. */
  occurredAt: Date;
  /** When the customer last wrote before this message, or null for a new chat. */
  previousInboundAt: Date | null;
}

export interface WhatsAppContactContext {
  /** The agency Owner: the fallback owner when the agency's rules and mode choose no one (release 4). */
  ownerUserId: string;
  /** Everyone who can work leads: the assignment chooses among them. */
  workers: ReadonlySet<string>;
}

export type WhatsAppContactOutcome =
  | { kind: "lead_created"; personId: string; leadId: string; ownerUserId: string | null }
  | { kind: "on_open_lead"; personId: string; leadId: string; ownerUserId: string | null; threadRestarted: boolean }
  | { kind: "past_customer"; personId: string }
  | { kind: "blocked"; personId: string | null };

const emptyTrip: TripInput = {
  destination: null,
  when: { kind: "unknown" },
  adults: null,
  childrenAges: [],
  budget: null,
  departureCity: null,
  tripType: null,
  hotelCategory: null,
  food: null,
  roomType: null,
};

function enquiryOf(contact: Pick<WhatsAppContact, "phoneE164" | "profileName" | "firstText">, name: string): Enquiry {
  return {
    person: { name, phone: contact.phoneE164 },
    trip: emptyTrip,
    note: contact.firstText === null ? null : contact.firstText.slice(0, MAX_NOTE_LENGTH),
    source: "whatsapp",
    sourceDetail: "WhatsApp chat",
  };
}

const placeholderNameOf = (phoneE164: string) => `WhatsApp ${internationalPhone(phoneE164)}`;

/** Whether a person's name is the stand-in a nameless number got, so a screen can show the WhatsApp profile name or the number. */
export const isWhatsAppPlaceholderName = (name: string, phoneE164: string): boolean =>
  name === placeholderNameOf(phoneE164);

/** The name a new person gets: their WhatsApp profile name, else the number, for staff to correct. */
const nameOf = (contact: Pick<WhatsAppContact, "phoneE164" | "profileName">): string => {
  const profile = contact.profileName?.trim() ?? "";
  return profile === "" ? placeholderNameOf(contact.phoneE164) : profile.slice(0, 120);
};

const quietLongEnough = (previous: Date | null, now: Date) =>
  previous === null || now.getTime() - previous.getTime() >= QUIET_HOURS * 3_600_000;

/** Decides what a customer's message does to the CRM and does it, in the caller's transaction. */
export async function receiveWhatsAppContact(
  tx: OrgTx,
  actor: Actor,
  contact: WhatsAppContact,
  context: WhatsAppContactContext,
  now: Date,
): Promise<WhatsAppContactOutcome> {
  const found = await matchPerson(tx, { phone: contact.phoneE164 });
  if (await isBlocked(tx, { phone: contact.phoneE164 })) {
    return { kind: "blocked", personId: found?.person.id ?? null };
  }
  if (found !== null) {
    const open = await newestOpenLead(tx, found.person.id);
    if (open !== null) {
      const threadRestarted = quietLongEnough(contact.previousInboundAt, contact.occurredAt);
      if (threadRestarted) {
        await recordLeadEvent(tx, actor, { leadId: open.id, kind: "whatsapp-contact", occurredAt: contact.occurredAt });
      }
      return {
        kind: "on_open_lead",
        personId: found.person.id,
        leadId: open.id,
        ownerUserId: open.ownerUserId,
        threadRestarted,
      };
    }
    if ((await tx.lead.count({ where: { personId: found.person.id } })) > 0) {
      return { kind: "past_customer", personId: found.person.id };
    }
  }
  const saved = await saveEnquiry(tx, actor, enquiryOf(contact, nameOf(contact)), now, {
    from: "import",
    ownerUserId: context.ownerUserId,
    stage: "new",
    createdAt: contact.occurredAt,
    notify: "each",
    assign: { workers: context.workers },
  });
  return { kind: "lead_created", personId: saved.personId, leadId: saved.leadId, ownerUserId: saved.leadOwnerUserId };
}

/**
 * Start a new lead (Q2): a lead for a person whose leads are all closed, marked Returning, through the same path. Refused
 * when they have an open lead already.
 */
export async function startLeadFromChat(
  tx: OrgTx,
  actor: Actor,
  input: { personId: string },
  context: WhatsAppContactContext,
  now: Date,
): Promise<{ leadId: string }> {
  const person = await tx.person.findFirst({
    where: { id: input.personId },
    select: { id: true, name: true, phoneE164: true },
  });
  if (person?.phoneE164 == null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "No such person");
  if ((await newestOpenLead(tx, person.id)) !== null) {
    throw new DomainError("CONFLICT", "OPEN_LEAD_EXISTS", "This person already has an open lead");
  }
  const saved = await saveEnquiry(
    tx,
    actor,
    enquiryOf({ phoneE164: person.phoneE164, profileName: null, firstText: null }, person.name),
    now,
    {
      from: "import",
      ownerUserId: context.ownerUserId,
      stage: "new",
      createdAt: null,
      notify: "each",
      assign: { workers: context.workers },
    },
  );
  return { leadId: saved.leadId };
}

/**
 * A staff reply on WhatsApp (or one sent from the phone) is the person's newest open lead's first reply, if it has had none
 * (I3): the lead list's reply time and the slow-reply alert then see it. Nothing when they have no open lead.
 */
export async function recordWhatsAppFirstReply(tx: OrgTx, personId: string, at: Date): Promise<void> {
  const open = await newestOpenLead(tx, personId);
  if (open === null) return;
  await tx.lead.updateMany({ where: { id: open.id, firstReplyAt: null }, data: { firstReplyAt: at } });
}
