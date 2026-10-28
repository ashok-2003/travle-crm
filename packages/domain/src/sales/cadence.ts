// The first WhatsApp and the follow-ups (sales execution). A lead that arrives by itself (an ad, the website, a sheet, an
// import) gets the agency's greeting template within a minute; then, if the customer never writes back, a nudge on each
// follow-up's day (Day 1, 3, 7), sent between 10:00 and 20:00 in the agency's zone. It stops for good the moment the
// customer writes, the lead closes or reaches Booking requested, or someone stops it; a STOP or a missing consent ends it
// too. Every touch has a key of its own, so a job run twice sends nothing twice. A lead from WhatsApp itself is already
// talking: it gets neither.
import { isOpenStage, leadStage } from "@travel-crm/contracts/crm";
import type { LeadCadenceView } from "@travel-crm/contracts/sales";
import type { Database, OrgTx } from "@travel-crm/db";
import { assertRecordInScope, type MemberAccess } from "../identity/index.js";
import { DomainError, addDays, calendarDateIn, instantAt, parseTimeOfDay } from "../kernel/index.js";
import { fillParams, leadFacts, type FillContext } from "./fill-params.js";
import { claimTouch, recordTouch, sendToLead } from "./send.js";
import { salesAutomationOf } from "./settings.js";

const DAY = 24 * 3_600_000;
const OPENS = 10;
const CLOSES = 20;

/** Leads that arrive by themselves, whom nobody has spoken to yet. */
const ARRIVED_BY_THEMSELVES = new Set([
  "website",
  "web_form",
  "google_sheet",
  "bulk_upload",
  "integration",
  "meta_lead_ad",
  "facebook",
  "instagram",
  "package_page",
]);

/** The moment itself when it is inside 10:00-20:00 in the zone, else the next 10:00. */
export function workingMoment(at: Date, timeZone: string): Date {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(at));
  if (hour >= OPENS && hour < CLOSES) return at;
  const day = calendarDateIn(at, timeZone);
  const opening = (date: typeof day) =>
    instantAt(date, parseTimeOfDay(`${String(OPENS).padStart(2, "0")}:00`), timeZone);
  return hour < OPENS ? opening(day) : opening(addDays(day, 1));
}

export interface CadenceDependencies {
  db: Database;
  timeZone: (organizationId: string) => Promise<string>;
  /** The agency's name and the lead owner's, for the blanks. */
  names: (organizationId: string, ownerUserId: string | null) => Promise<Omit<FillContext, "payment">>;
}

/** On a new lead: the greeting now, if the agency turned it on, and the follow-ups enrolled. Safe to run twice. */
export async function greetNewLead(
  dependencies: CadenceDependencies,
  input: { organizationId: string; leadId: string },
  now: Date,
): Promise<void> {
  const { db } = dependencies;
  const timeZone = await dependencies.timeZone(input.organizationId);
  const plan = await db.forOrg(input.organizationId, async (tx) => {
    const settings = await salesAutomationOf(tx);
    const lead = await tx.lead.findUnique({
      where: { id: input.leadId },
      select: { source: true, createdAt: true, person: { select: { phoneE164: true } } },
    });
    if (lead === null || lead.source === "whatsapp" || lead.person.phoneE164 === null) return null;
    if (settings.followEnabled && settings.followSteps[0] !== undefined) {
      await tx.leadCadence.createMany({
        data: [
          {
            leadId: input.leadId,
            enrolledAt: lead.createdAt,
            nextAt: workingMoment(new Date(lead.createdAt.getTime() + settings.followSteps[0].days * DAY), timeZone),
          },
        ],
        skipDuplicates: true,
      });
    }
    const greet = settings.speedEnabled && settings.speedTemplateId !== null && ARRIVED_BY_THEMSELVES.has(lead.source);
    return greet ? settings : null;
  });
  if (plan === null) return;
  const facts = await db.forOrg(input.organizationId, (tx) => leadFacts(tx, input.leadId));
  if (facts === null) return;
  const names = await dependencies.names(input.organizationId, facts.ownerUserId);
  await db.forOrg(input.organizationId, async (tx) => {
    const touch = { kind: "speed" as const, key: `speed:${input.leadId}`, leadId: input.leadId };
    if (!(await claimTouch(tx, touch))) return;
    const result = await sendToLead(
      tx,
      {
        organizationId: input.organizationId,
        leadId: input.leadId,
        templateId: plan.speedTemplateId,
        params: fillParams(plan.speedParams, facts, names),
        agreed: plan.contactEnquirers,
        clientToken: touch.key,
      },
      now,
    );
    await recordTouch(tx, touch, result);
  });
}

interface Due {
  id: string;
  leadId: string;
  step: number;
  enrolledAt: Date;
}

/** One due follow-up, claimed under its row's lock: sent, put off, or the run ended. */
async function followUp(
  dependencies: CadenceDependencies,
  organizationId: string,
  timeZone: string,
  due: Due,
  now: Date,
): Promise<void> {
  const { db } = dependencies;
  const end = (tx: OrgTx, state: "done" | "stopped", reason: string) =>
    tx.leadCadence.update({ where: { id: due.id }, data: { state, stopReason: reason } });
  const checked = await db.forOrg(organizationId, async (tx) => {
    const settings = await salesAutomationOf(tx);
    const lead = await tx.lead.findUnique({
      where: { id: due.leadId },
      select: { stage: true, personId: true },
    });
    if (lead === null || !isOpenStage(leadStage.parse(lead.stage)) || lead.stage === "booking_requested") {
      await end(tx, "done", "closed");
      return null;
    }
    // The customer wrote after the run began: a person takes it from here.
    const wrote = await tx.whatsappConversation.findFirst({
      where: { personId: lead.personId, lastInboundAt: { gt: due.enrolledAt } },
      select: { id: true },
    });
    if (wrote !== null) {
      await end(tx, "stopped", "replied");
      return null;
    }
    const step = settings.followSteps[due.step];
    if (!settings.followEnabled || step === undefined) {
      await end(tx, "done", settings.followEnabled ? "finished" : "turned_off");
      return null;
    }
    return { step, settings };
  });
  if (checked === null) return;
  const facts = await db.forOrg(organizationId, (tx) => leadFacts(tx, due.leadId));
  if (facts === null) return;
  const names = await dependencies.names(organizationId, facts.ownerUserId);
  await db.forOrg(organizationId, async (tx) => {
    const touch = { kind: "follow" as const, key: `follow:${due.leadId}:${String(due.step)}`, leadId: due.leadId };
    // A repeat of a step that went already only moves on.
    if (await claimTouch(tx, touch)) {
      const result = await sendToLead(
        tx,
        {
          organizationId,
          leadId: due.leadId,
          templateId: checked.step.templateId,
          params: fillParams(checked.step.params, facts, names),
          agreed: checked.settings.contactEnquirers,
          clientToken: touch.key,
        },
        now,
      );
      if (result.kind === "later") {
        const later = workingMoment(new Date(now.getTime() + 3_600_000), timeZone);
        await tx.leadCadence.update({ where: { id: due.id }, data: { nextAt: later } });
        return;
      }
      await recordTouch(tx, touch, result);
      if (result.kind === "never") {
        await end(tx, "stopped", result.reason === "NO_CONSENT_FOR_TEMPLATE" ? "opted_out" : "cant_send");
        return;
      }
    }
    const next = checked.settings.followSteps[due.step + 1];
    await tx.leadCadence.update({
      where: { id: due.id },
      data:
        next === undefined
          ? { step: due.step + 1, state: "done", stopReason: "finished" }
          : {
              step: due.step + 1,
              nextAt: workingMoment(new Date(due.enrolledAt.getTime() + next.days * DAY), timeZone),
            },
    });
  });
}

/** An agency's due follow-ups, a few at a time, each claimed so overlapping runs never double. Returns how many. */
export async function runFollowUpsFor(
  dependencies: CadenceDependencies,
  organizationId: string,
  now: Date,
): Promise<number> {
  const { db } = dependencies;
  const timeZone = await dependencies.timeZone(organizationId);
  let done = 0;
  for (let index = 0; index < 20; index += 1) {
    const due = await db.forOrg(organizationId, async (tx) => {
      const [row] = await tx.$queryRaw<Due[]>`
        SELECT id, lead_id AS "leadId", step, enrolled_at AS "enrolledAt" FROM lead_cadence
        WHERE state = 'active' AND next_at <= ${now}
        ORDER BY next_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (row === undefined) return null;
      // Pushed on at once, so another run in the same minute leaves it; the follow-up sets the real next time.
      await tx.leadCadence.update({ where: { id: row.id }, data: { nextAt: new Date(now.getTime() + 10 * 60_000) } });
      return row;
    });
    if (due === null) break;
    await followUp(dependencies, organizationId, timeZone, due, now);
    done += 1;
  }
  return done;
}

/** Ends a lead's follow-ups when its customer writes (the inbound listener's call). */
export async function stopFollowUpsOnReply(tx: OrgTx, personId: string): Promise<void> {
  await tx.leadCadence.updateMany({
    where: { state: "active", lead: { personId } },
    data: { state: "stopped", stopReason: "replied" },
  });
}

async function cadenceRow(tx: OrgTx, access: MemberAccess, leadId: string) {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { ownerUserId: true } });
  if (lead === null) throw new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");
  assertRecordInScope(access, "leads:view", lead.ownerUserId);
  return tx.leadCadence.findFirst({
    where: { leadId },
    select: { id: true, state: true, step: true, nextAt: true, stopReason: true, enrolledAt: true },
  });
}

/** A lead's follow-ups as its page shows them; null when it has none. */
export async function leadCadenceOf(tx: OrgTx, access: MemberAccess, leadId: string): Promise<LeadCadenceView | null> {
  const row = await cadenceRow(tx, access, leadId);
  if (row === null) return null;
  const settings = await salesAutomationOf(tx);
  return {
    state: row.state === "active" || row.state === "done" ? row.state : "stopped",
    sent: await tx.salesTouch.count({ where: { leadId, kind: "follow", outcome: "sent" } }),
    steps: settings.followSteps.length,
    nextAt: row.state === "active" ? row.nextAt.toISOString() : null,
    stopReason: row.stopReason,
  };
}

/** Someone stops a lead's follow-ups by hand (they spoke on the phone), or starts them again from the next step. */
export async function setFollowUps(
  tx: OrgTx,
  access: MemberAccess,
  input: { leadId: string; on: boolean },
  now: Date,
  timeZone: string,
): Promise<void> {
  const row = await cadenceRow(tx, access, input.leadId);
  if (input.on) {
    const settings = await salesAutomationOf(tx);
    if (!settings.followEnabled || settings.followSteps.length === 0) {
      throw new DomainError("CONFLICT", "FOLLOW_UPS_OFF", "Turn on follow-ups in Settings, Sales automation first");
    }
    const step = row?.step ?? 0;
    if (step >= settings.followSteps.length) {
      throw new DomainError("CONFLICT", "FOLLOW_UPS_FINISHED", "Every follow-up was sent already");
    }
    // Started again now: the next one waits a day, and the customer's earlier messages don't stop it.
    const nextAt = workingMoment(new Date(now.getTime() + DAY), timeZone);
    if (row === null) {
      await tx.leadCadence.create({ data: { leadId: input.leadId, enrolledAt: now, nextAt } });
    } else {
      await tx.leadCadence.update({
        where: { id: row.id },
        data: { state: "active", stopReason: null, stoppedBy: null, enrolledAt: now, nextAt },
      });
    }
    return;
  }
  if (row?.state === "active") {
    await tx.leadCadence.update({
      where: { id: row.id },
      data: { state: "stopped", stopReason: "by_hand", stoppedBy: access.userId },
    });
  }
}
