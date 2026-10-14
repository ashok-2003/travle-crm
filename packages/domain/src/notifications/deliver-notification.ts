// The worker's delivery of one notification by email and web push (spec 9.4): from our address under the
// organization's name with its Reply-To, respecting each person's opt-outs, and never to someone who has left.
import { notificationCreatedEvent } from "@travel-crm/contracts/notifications";
import type { OrgTx } from "@travel-crm/db";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import { PushPayloadTooLargeError, type PushSender } from "@travel-crm/integrations/push";
import type { MemberContact, OrganizationProfile } from "../identity/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import { isOptedOut } from "./preferences.js";
import { fitPushPayload } from "./push-payload.js";

export interface DeliveryDependencies {
  email: EmailSender;
  push: PushSender;
  /** identity's organizationProfile: the organization's name and contact email. */
  organizationProfile(organizationId: string): Promise<OrganizationProfile | null>;
  /** identity's memberContacts: active members only, with null for staff without email. */
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** Where people open the web app, e.g. https://app.example.in. Links and the opt-out page are made absolute with it. */
  appUrl: string;
  /** Where permanent failures are reported, with ids only and never personal data. Defaults to console.warn. */
  log?: ((message: string) => void) | undefined;
}

/** The web app's origin, checked once when the listener is built rather than on every delivery. */
function webAppOrigin(appUrl: string): string {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RangeError(`The web app's address must be http(s), got ${JSON.stringify(url.protocol)}`);
  }
  return url.origin;
}

/** What delivery needs about one notification, read in one short transaction. */
async function loadDelivery(context: ListenerContext, notificationId: string) {
  return context.forOrg(async (tx) => {
    const notification = await tx.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return null;
    const recipient = { userId: notification.recipientUserId };
    const preferences = await tx.notificationPreference.findMany({ where: recipient });
    const subscriptions = await tx.pushSubscription.findMany({ where: recipient });
    return { notification, preferences, subscriptions };
  });
}

/**
 * How long a claim holds a channel. Above the worst a send can take (SMTP times out within 30 seconds, a push within
 * 10) and below the jobs' retry window, so a run that crashed after claiming is taken over by a retry, while a run
 * that is merely slow is not sent over.
 */
const LEASE_MS = 5 * 60_000;

/** The columns of one channel's delivery: when it is claimed, and when it was sent. */
const columns = {
  email: { claimed: "emailClaimedAt", sent: "emailedAt" },
  push: { claimed: "pushClaimedAt", sent: "pushedAt" },
} as const;
type DeliveryChannel = keyof typeof columns;

const claimable = (channel: DeliveryChannel, now: Date) => ({
  [columns[channel].sent]: null,
  OR: [
    { [columns[channel].claimed]: null },
    { [columns[channel].claimed]: { lt: new Date(now.getTime() - LEASE_MS) } },
  ],
});

/** The notification as `claim` needs it: set `data` where the claim still stands. */
const updateWhere = (tx: OrgTx, where: object, data: object) => tx.notification.updateMany({ where, data });

/**
 * Takes the channel for this run, in its own committed transaction: only the run that finds it unsent and unclaimed
 * (or claimed longer ago than the lease) wins. Returns the claim's time, or null when another run holds it.
 */
async function claim(context: ListenerContext, id: string, channel: DeliveryChannel): Promise<Date | null> {
  const claimedAt = new Date();
  const taken = await context.forOrg((tx) =>
    updateWhere(tx, { id, ...claimable(channel, claimedAt) }, { [columns[channel].claimed]: claimedAt }),
  );
  return taken.count > 0 ? claimedAt : null;
}

/** Gives a claim back after a failed send, but only if it is still this run's. Never hides the send's own error. */
async function release(context: ListenerContext, id: string, channel: DeliveryChannel, claimedAt: Date): Promise<void> {
  try {
    await context.forOrg((tx) =>
      updateWhere(tx, { id, [columns[channel].claimed]: claimedAt }, { [columns[channel].claimed]: null }),
    );
  } catch {
    // The lease expires on its own; the send's error is the one worth reporting.
  }
}

async function markSent(context: ListenerContext, id: string, channel: DeliveryChannel): Promise<void> {
  await context.forOrg((tx) => updateWhere(tx, { id }, { [columns[channel].sent]: new Date() }));
}

/**
 * This run lost the claim. If the other run has finished sending there is nothing to do; otherwise it is still
 * sending (or died), so ask to be retried: by then the send is recorded, or the lease has expired.
 */
async function waitForOtherRun(context: ListenerContext, id: string, channel: DeliveryChannel): Promise<void> {
  const row = await context.forOrg((tx) => tx.notification.findUnique({ where: { id } }));
  if (row?.[columns[channel].sent] != null) return;
  throw new Error(`Notification ${id}: the ${channel} is being delivered by another run`);
}

/** A failure that sending again cannot fix: bad content, an oversized push, or a 5xx answer from the mail server. */
function isPermanent(error: unknown): boolean {
  if (error instanceof RangeError || error instanceof PushPayloadTooLargeError) return true;
  const responseCode = (error as { responseCode?: unknown } | null)?.responseCode;
  return typeof responseCode === "number" && responseCode >= 500 && responseCode < 600;
}

/**
 * Runs one channel. A permanent failure is reported (ids only) and ends the channel without a retry; any other failure
 * comes back, for the caller to raise once the other channel has had its turn.
 */
async function attempt(
  channel: DeliveryChannel,
  id: string,
  log: (message: string) => void,
  run: () => Promise<void>,
): Promise<Error | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    if (!isPermanent(error)) return error instanceof Error ? error : new Error(`Notification ${id}: ${channel} failed`);
    const kind = error instanceof Error ? error.name : "Error";
    log(`Notification ${id}: the ${channel} can't be delivered and won't be retried (${kind})`);
    return undefined;
  }
}

/**
 * Listens for "notification.created". Email and push are separate: each is claimed with a lease before it is sent and
 * marked sent (emailed_at, pushed_at) only once a send worked, so overlapping or repeated runs send once, a crashed
 * run's claim is taken over after the lease, and a retry sends only what is missing. A failure that can never succeed
 * is reported and not retried; any other failure is raised after both channels have had their turn.
 */
export function deliverNotificationListener(dependencies: DeliveryDependencies): EventListener {
  const appOrigin = webAppOrigin(dependencies.appUrl);
  const preferencesPage = `${appOrigin}/settings/notifications`;
  const log =
    dependencies.log ??
    ((message: string) => {
      console.warn(message);
    });

  return defineListener({
    name: "notifications.deliver",
    eventType: "notification.created",
    payload: notificationCreatedEvent,
    handle: async (event, context) => {
      const delivery = await loadDelivery(context, event.payload.notificationId);
      // A notification id from another organization finds nothing under row-level security.
      if (!delivery) return;
      const { notification, preferences, subscriptions } = delivery;
      const [contact] = await dependencies.memberContacts(event.organizationId, [notification.recipientUserId]);
      // Not an active member any more: they get nothing about an organization they have left.
      if (!contact) return;
      const link = notification.link === null ? undefined : `${appOrigin}${notification.link}`;

      const deliverEmail = async () => {
        const wanted =
          event.payload.channels.includes("email") &&
          notification.emailedAt === null &&
          contact.email !== null &&
          !isOptedOut(preferences, "email", notification.kind);
        if (!wanted || contact.email === null) return;
        const organization = await dependencies.organizationProfile(event.organizationId);
        if (!organization) throw new Error(`Organization ${event.organizationId} has no profile`);
        const { html, text } = renderEmail({
          heading: notification.title,
          paragraphs: [notification.body],
          action: link === undefined ? undefined : { label: "Open", url: link },
          footer:
            `You get this email because you work with ${organization.name}. ` +
            `Choose which emails you get at ${preferencesPage}.`,
        });
        const claimedAt = await claim(context, notification.id, "email");
        if (claimedAt === null) return waitForOtherRun(context, notification.id, "email");
        try {
          await dependencies.email.send({
            to: { name: contact.name, address: contact.email },
            fromName: senderNameFor(organization.name),
            replyTo: organization.contactEmail ?? undefined,
            subject: notification.title,
            text,
            html,
            headers: { "List-Unsubscribe": `<${preferencesPage}>` },
          });
        } catch (error) {
          // A permanent failure keeps its claim: it is not retried, and the lease only matters to a repeat of the event.
          if (!isPermanent(error)) await release(context, notification.id, "email", claimedAt);
          throw error;
        }
        await markSent(context, notification.id, "email");
      };

      const deliverPush = async () => {
        const wanted =
          event.payload.channels.includes("push") &&
          notification.pushedAt === null &&
          subscriptions.length > 0 &&
          !isOptedOut(preferences, "push", notification.kind);
        if (!wanted) return;
        const claimedAt = await claim(context, notification.id, "push");
        if (claimedAt === null) return waitForOtherRun(context, notification.id, "push");
        const payload = fitPushPayload({
          title: notification.title,
          body: notification.body,
          url: notification.link ?? undefined,
        });
        // Each browser on its own: one failing doesn't stop the others.
        const results = await Promise.allSettled(
          subscriptions.map((subscription) => dependencies.push.send(subscription, payload)),
        );
        const gone = subscriptions.filter((_, index) => {
          const result = results[index];
          return result?.status === "fulfilled" && result.value === "gone";
        });
        // The push service forgot these browsers (unsubscribed, or the browser dropped them).
        if (gone.length > 0) {
          const ids = gone.map(({ id }) => id);
          await context.forOrg((tx) => tx.pushSubscription.deleteMany({ where: { id: { in: ids } } }));
        }
        const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
        const reached = results.some((result) => result.status === "fulfilled" && result.value === "sent");
        // Done when at least one browser got it, or none is left to try: the others missing it is not worth a repeat.
        if (reached || failures.length === 0) {
          await markSent(context, notification.id, "push");
          return;
        }
        const retryable = failures.find((failure) => !isPermanent(failure));
        if (retryable === undefined)
          throw failures[0] instanceof Error
            ? failures[0]
            : new Error(`Notification ${notification.id}: the push failed`);
        await release(context, notification.id, "push", claimedAt);
        throw retryable instanceof Error ? retryable : new Error(`Notification ${notification.id}: the push failed`);
      };

      const problems = await Promise.all([
        attempt("email", notification.id, log, deliverEmail),
        attempt("push", notification.id, log, deliverPush),
      ]);
      const problem = problems.find((candidate) => candidate !== undefined);
      if (problem) throw problem;
    },
  });
}
