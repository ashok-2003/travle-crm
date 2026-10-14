// The worker's delivery of one notification by email and web push (spec 9.4): from our address under the
// organization's name with its Reply-To, respecting each person's opt-outs, and never to someone who has left.
import { notificationCreatedEvent } from "@travel-crm/contracts/notifications";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import type { PushSender } from "@travel-crm/integrations/push";
import type { MemberContact, OrganizationProfile } from "../identity/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import {
  checkOtherRun,
  claim,
  email as emailChannel,
  markSent,
  push as pushChannel,
  release,
} from "./delivery-claims.js";
import { attempt, isPermanent, NothingToDeliverError } from "./delivery-failures.js";
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
  /** Where failures that need attention are reported, with ids only and never personal data. The worker passes its logger. */
  log: (message: string) => void;
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
 * Listens for "notification.created". Email and push are separate: each is claimed with a lease before it is sent and
 * marked sent (emailed_at, pushed_at) only once a send worked, so overlapping or repeated runs send once, a crashed
 * run's claim is taken over after the lease, and a retry sends only what is missing. A failure that can never succeed
 * is reported and not retried; any other failure is raised after both channels have had their turn.
 */
export function deliverNotificationListener(dependencies: DeliveryDependencies): EventListener {
  const appOrigin = webAppOrigin(dependencies.appUrl);
  const preferencesPage = `${appOrigin}/settings/notifications`;
  const { log } = dependencies;

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
      const id = notification.id;

      const deliverEmail = async () => {
        const wanted =
          event.payload.channels.includes("email") &&
          notification.emailedAt === null &&
          notification.emailFailedAt === null &&
          !isOptedOut(preferences, "email", notification.kind);
        // Staff without email (a null address) get no email.
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
        const claimedAt = await claim(context, id, emailChannel);
        if (claimedAt === null) return checkOtherRun(context, id, emailChannel);
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
          // A permanent failure is recorded by the caller, which also drops the claim.
          if (!isPermanent(error)) await release(context, id, emailChannel, claimedAt, log);
          throw error;
        }
        await markSent(context, id, emailChannel);
      };

      const deliverPush = async () => {
        const wanted =
          event.payload.channels.includes("push") &&
          notification.pushedAt === null &&
          notification.pushFailedAt === null &&
          subscriptions.length > 0 &&
          !isOptedOut(preferences, "push", notification.kind);
        if (!wanted) return;
        const claimedAt = await claim(context, id, pushChannel);
        if (claimedAt === null) return checkOtherRun(context, id, pushChannel);
        const payload = fitPushPayload({
          title: notification.title,
          body: notification.body,
          url: notification.link ?? undefined,
        });
        // Each browser on its own: one failing doesn't stop the others.
        const results = await Promise.allSettled(
          subscriptions.map((subscription) => dependencies.push.send(subscription, payload)),
        );
        const reached = results.some((result) => result.status === "fulfilled" && result.value === "sent");
        const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
        const forgotten = subscriptions.filter((_, index) => {
          const result = results[index];
          return result?.status === "fulfilled" && result.value === "gone";
        });

        if (reached) await markSent(context, id, pushChannel);
        // The push service forgot these browsers (unsubscribed, or the browser dropped them). Recorded after the
        // send, so failing to forget them never causes a push that arrived to be sent again.
        if (forgotten.length > 0) {
          const ids = forgotten.map((subscription) => subscription.id);
          await context
            .forOrg((tx) => tx.pushSubscription.deleteMany({ where: { id: { in: ids } } }))
            .catch(() => {
              log(`Notification ${id}: ${String(ids.length)} forgotten push subscription(s) could not be deleted`);
            });
        }
        if (reached) return;
        // Every browser was forgotten: nothing to deliver to. Recorded like any other give-up, by `attempt`.
        if (failures.length === 0) throw new NothingToDeliverError();

        const retryable = failures.find((failure) => !isPermanent(failure)) ?? failures[0];
        if (!isPermanent(retryable)) await release(context, id, pushChannel, claimedAt, log);
        throw retryable instanceof Error ? retryable : new Error(`Notification ${id}: the push failed`);
      };

      const problems = await Promise.all([
        attempt(context, emailChannel, id, log, deliverEmail),
        attempt(context, pushChannel, id, log, deliverPush),
      ]);
      const problem = problems.find((candidate) => candidate !== undefined);
      if (problem) throw problem;
    },
  });
}
