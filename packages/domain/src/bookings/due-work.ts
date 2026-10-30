// The worker's side of bookings (release 6): each minute, for every agency that may still change things, the reminders now due
// and the claims left waiting over a day; each night, the trips that ended become Completed (the day after their last day).
// One agency failing never stops the rest.
import type { Logger } from "@travel-crm/integrations/logging";
import { recordAudit } from "../audit/index.js";
import type { Identity } from "../identity/index.js";
import { calendarDateIn, systemActor } from "../kernel/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import { raiseStaleClaims } from "./claims.js";
import { runBookingRemindersFor, skipUnsentReminders, type ReminderDependencies } from "./reminders.js";
import { asDate } from "./rows.js";

/** The queues of the minute's work and the night's. */
export const BOOKING_DUE_WORK_QUEUE = "bookings.due-work";
export const BOOKING_COMPLETE_QUEUE = "bookings.complete";
const PAGE = 100;

export interface BookingJobDependencies extends ReminderDependencies {
  identity: Pick<Identity, "organizationsPage" | "membersHolding">;
  subscriptions: Pick<SubscriptionAccess, "entitlementsOf">;
  logger: Logger;
}

async function forEachAgency(
  dependencies: Pick<BookingJobDependencies, "identity" | "subscriptions" | "logger">,
  work: (organization: { id: string; timeZone: string }) => Promise<number>,
): Promise<number> {
  let done = 0;
  let after: string | undefined;
  for (;;) {
    const page = await dependencies.identity.organizationsPage({ after, limit: PAGE });
    for (const organization of page) {
      try {
        const entitlements = await dependencies.subscriptions.entitlementsOf(organization.id);
        if (entitlements?.access !== "full") continue;
        done += await work(organization);
      } catch (error) {
        dependencies.logger.error(
          { organizationId: organization.id, error: error instanceof Error ? error.name : "unknown" },
          "The bookings work failed for an agency",
        );
      }
    }
    if (page.length < PAGE) return done;
    after = page.at(-1)?.id;
  }
}

/** The minute's work: due reminders sent (or made into tasks), and stale claims raised. */
export async function runBookingDueWork(dependencies: BookingJobDependencies, now: Date): Promise<number> {
  return forEachAgency(dependencies, async (organization) => {
    const sent = await runBookingRemindersFor(dependencies, organization.id, now);
    const managers = await dependencies.identity.membersHolding(organization.id, "quotes:record_payments");
    await dependencies.db.forOrg(organization.id, (tx) => raiseStaleClaims(tx, organization.id, managers, now));
    return sent;
  });
}

/** The night's work: a confirmed trip whose last day was before today is Completed. Returns how many. */
export async function completeFinishedBookings(dependencies: BookingJobDependencies, now: Date): Promise<number> {
  return forEachAgency(dependencies, async (organization) => {
    const today = asDate(calendarDateIn(now, organization.timeZone));
    return dependencies.db.forOrg(organization.id, async (tx) => {
      const actor = systemActor(organization.id);
      const over = await tx.booking.findMany({
        where: {
          status: "confirmed",
          OR: [{ endDate: { lt: today } }, { endDate: null, startDate: { lt: today } }],
        },
        take: 500,
        select: { id: true },
      });
      for (const booking of over) {
        await tx.booking.update({ where: { id: booking.id }, data: { status: "completed" } });
        await skipUnsentReminders(tx, actor, booking.id, "completed", now);
        await recordAudit(tx, actor, {
          action: "booking.completed",
          entityType: "booking",
          entityId: booking.id,
          before: { status: "confirmed" },
          after: { status: "completed" },
        });
      }
      return over.length;
    });
  });
}
