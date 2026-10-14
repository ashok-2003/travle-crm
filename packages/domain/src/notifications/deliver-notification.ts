// The worker's delivery of one notification by email and web push (spec 9.4): from our address under the
// organization's name with its Reply-To, respecting each person's opt-outs, and never to someone who has left.
import { notificationCreatedEvent } from "@travel-crm/contracts/notifications";
import { renderEmail, senderNameFor, type EmailSender } from "@travel-crm/integrations/email";
import type { PushSender } from "@travel-crm/integrations/push";
import type { MemberContact, OrganizationProfile } from "../identity/index.js";
import { defineListener, type EventListener, type ListenerContext } from "../jobs/index.js";
import { isOptedOut } from "./preferences.js";

export interface DeliveryDependencies {
  email: EmailSender;
  push: PushSender;
  /** identity's organizationProfile: the organization's name and contact email. */
  organizationProfile(organizationId: string): Promise<OrganizationProfile | null>;
  /** identity's memberContacts: active members only, with null for staff without email. */
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
  /** Where people open the web app, e.g. https://app.example.in. Links and the opt-out page are made absolute with it. */
  appUrl: string;
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

type Channel = "emailedAt" | "pushedAt";

/**
 * Claims a channel for this delivery: marks it done before sending, in its own committed transaction, and says
 * whether this delivery won. A duplicate or overlapping delivery of the same event loses and sends nothing.
 */
async function claim(context: ListenerContext, notificationId: string, channel: Channel): Promise<boolean> {
  const claimed = await context.forOrg((tx) =>
    tx.notification.updateMany({ where: { id: notificationId, [channel]: null }, data: { [channel]: new Date() } }),
  );
  return claimed.count > 0;
}

/** Gives a claim back after a failed send, so the retry sends it. */
async function release(context: ListenerContext, notificationId: string, channel: Channel): Promise<void> {
  await context.forOrg((tx) =>
    tx.notification.updateMany({ where: { id: notificationId }, data: { [channel]: null } }),
  );
}

/**
 * Listens for "notification.created". Each channel is claimed (emailed_at, pushed_at) before it is sent, so a
 * duplicate or overlapping delivery of the same event sends nothing twice. A failed send gives the claim back and
 * throws, so the retry sends only what is missing. A crash between the claim and the send loses that one email or
 * push rather than repeating it.
 */
export function deliverNotificationListener(dependencies: DeliveryDependencies): EventListener {
  const appOrigin = webAppOrigin(dependencies.appUrl);
  const preferencesPage = `${appOrigin}/settings/notifications`;

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

      const wantsEmail = event.payload.channels.includes("email") && notification.emailedAt === null;
      if (wantsEmail && contact.email !== null && !isOptedOut(preferences, "email", notification.kind)) {
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
        if (await claim(context, notification.id, "emailedAt")) {
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
            await release(context, notification.id, "emailedAt");
            throw error;
          }
        }
      }

      const wantsPush = event.payload.channels.includes("push") && notification.pushedAt === null;
      if (
        wantsPush &&
        !isOptedOut(preferences, "push", notification.kind) &&
        (await claim(context, notification.id, "pushedAt"))
      ) {
        const payload = { title: notification.title, body: notification.body, url: notification.link ?? undefined };
        const gone: string[] = [];
        try {
          for (const subscription of subscriptions) {
            if ((await dependencies.push.send(subscription, payload)) === "gone") gone.push(subscription.id);
          }
        } catch (error) {
          await release(context, notification.id, "pushedAt");
          throw error;
        } finally {
          // The push service forgot these browsers (unsubscribed, or the browser dropped them).
          if (gone.length > 0) {
            await context.forOrg((tx) => tx.pushSubscription.deleteMany({ where: { id: { in: gone } } }));
          }
        }
      }
    },
  });
}
