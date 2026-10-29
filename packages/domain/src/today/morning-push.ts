// The morning push (release 5, spec 3.3): at the time each person picked, in the agency's zone, a push with the plain
// count of their day, "8 things today, 2 overdue". Every 15 minutes the worker looks at every agency for people whose
// time has come and who have not had today's; a person with nothing to do gets no push. Counts only: no names, no
// numbers. The person's day goes in the same transaction as the notification, so a repeat sends nothing (the
// notification's source is a key of the person and the day). Only people with a phone registered for push.
import { DEFAULT_MORNING_TIME, MORNING_PUSH_KIND } from "@travel-crm/contracts/notifications";
import type { Database } from "@travel-crm/db";
import type { Logger } from "@travel-crm/integrations/logging";
import { noticeKey } from "../crm/index.js";
import type { Identity, MemberAccess } from "../identity/index.js";
import { calendarDateIn, systemActor, timeOfDayIn } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { SubscriptionAccess } from "../subscriptions/index.js";
import { todaySummary } from "./today.js";

/** The queue of the 15-minute look. */
export const MORNING_PUSH_QUEUE = "today.morning-push";
const PAGE = 100;
/** A person whose time passed longer ago than this (the worker was down) is left alone: a morning push at supper is no help. */
const LATE_AFTER_MINUTES = 120;

export interface MorningPushDependencies {
  db: Database;
  identity: Pick<Identity, "organizationsPage" | "memberContacts" | "resolveAccess">;
  subscriptions: SubscriptionAccess;
  logger: Logger;
}

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** "8 things today, 2 overdue"; "1 thing today"; null for nothing to do. */
export function morningWords(counts: { total: number; overdue: number }): string | null {
  if (counts.total === 0) return null;
  const things = `${String(counts.total)} ${counts.total === 1 ? "thing" : "things"} today`;
  return counts.overdue === 0 ? things : `${things}, ${String(counts.overdue)} overdue`;
}

/** One person's morning: stamps their day and, when there is something to do, pushes the count. */
async function pushTo(
  dependencies: MorningPushDependencies,
  access: MemberAccess,
  now: Date,
  day: string,
): Promise<boolean> {
  return dependencies.db.forOrg(access.organizationId, async (tx) => {
    // The day is claimed first, under the row's lock, so two runs at once send one.
    const claimed = await tx.morningPushSetting.updateMany({
      where: {
        userId: access.userId,
        OR: [{ lastSentOn: null }, { lastSentOn: { lt: new Date(`${day}T00:00:00Z`) } }],
      },
      data: { lastSentOn: new Date(`${day}T00:00:00Z`) },
    });
    if (claimed.count === 0) return false;
    const { counts } = await todaySummary(tx, access, now);
    const total = counts.overdue + counts.dueToday + counts.newLeads + counts.quoteOpened + counts.paymentsDue;
    const title = morningWords({ total, overdue: counts.overdue });
    if (title === null) return false;
    await notify(tx, systemActor(access.organizationId), {
      recipientUserIds: [access.userId],
      sourceEventId: noticeKey(`${access.userId}:${day}`, MORNING_PUSH_KIND),
      kind: MORNING_PUSH_KIND,
      title,
      body: "Open Today to see them.",
      link: "/today",
      channels: ["push"],
    });
    return true;
  });
}

/** One agency's morning: the people whose time has come, with a phone for push and a day to look at. */
export async function runMorningPushFor(
  dependencies: MorningPushDependencies,
  organization: { id: string; timeZone: string },
  now: Date,
): Promise<number> {
  const { db, identity } = dependencies;
  const entitlements = await dependencies.subscriptions.entitlementsOf(organization.id);
  if (entitlements?.access !== "full" && entitlements?.access !== "read_only") return 0;
  const day = calendarDateIn(now, organization.timeZone);
  const nowMinutes = minutesOf(timeOfDayIn(now, organization.timeZone));
  const due = await db.forOrg(organization.id, async (tx) => {
    const phones = await tx.pushSubscription.findMany({ distinct: ["userId"], select: { userId: true } });
    if (phones.length === 0) return [];
    const chosen = await tx.morningPushSetting.findMany({
      where: { userId: { in: phones.map((phone) => phone.userId) } },
      select: { userId: true, enabled: true, localTime: true, lastSentOn: true },
    });
    const byUser = new Map(chosen.map((row) => [row.userId, row]));
    return phones.flatMap(({ userId }) => {
      const setting = byUser.get(userId);
      if (setting?.enabled === false) return [];
      if (setting?.lastSentOn?.toISOString().slice(0, 10) === day) return [];
      const waited = nowMinutes - minutesOf(setting?.localTime ?? DEFAULT_MORNING_TIME);
      return waited >= 0 && waited <= LATE_AFTER_MINUTES ? [userId] : [];
    });
  });
  if (due.length === 0) return 0;
  const active = new Set((await identity.memberContacts(organization.id, due)).map((member) => member.userId));
  let sent = 0;
  for (const userId of due.filter((candidate) => active.has(candidate))) {
    const access = await identity.resolveAccess(userId, organization.id);
    if (!access?.permissions.has("leads:view")) continue;
    // A person who never chose has no row yet: make theirs, on at the default time, so the day can be stamped.
    await db.forOrg(organization.id, (tx) =>
      tx.morningPushSetting.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId } },
        create: { userId },
        update: {},
      }),
    );
    if (await pushTo(dependencies, access, now, day)) sent += 1;
  }
  return sent;
}

/** Every agency, a page at a time; one failing never stops the rest. */
export async function runMorningPush(dependencies: MorningPushDependencies, now: Date): Promise<number> {
  let sent = 0;
  let after: string | undefined;
  for (;;) {
    const page = await dependencies.identity.organizationsPage({ after, limit: PAGE });
    for (const organization of page) {
      try {
        sent += await runMorningPushFor(dependencies, organization, now);
      } catch (error) {
        dependencies.logger.error(
          { organizationId: organization.id, error: error instanceof Error ? error.name : "unknown" },
          "The morning push failed for an agency",
        );
      }
    }
    if (page.length < PAGE) return sent;
    after = page.at(-1)?.id;
  }
}
