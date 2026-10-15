// What the delivery tests share: a database, an organization, memory email and push senders, and members to notify.
// Every test makes its own members, so tests don't depend on each other or on their order.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryEmailSender, type MemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryPushSender, type MemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, beforeEach, inject } from "vitest";
import type { MemberContact, OrganizationProfile } from "../../src/identity/index.js";
import type { DomainEvent, ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import {
  deliverNotificationListener,
  notify,
  savePushSubscription,
  type DeliveryDependencies,
} from "../../src/notifications/index.js";
import { eventsOfType, personIn } from "./test-support.js";

export const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };

export interface DeliveryKit {
  readonly db: Database;
  readonly platform: PlatformClient;
  readonly organizationId: string;
  email: MemoryEmailSender;
  push: MemoryPushSender;
  profile: OrganizationProfile;
  /** What the delivery listener logged (it logs ids only). */
  logs: string[];
  dependencies(overrides?: Partial<DeliveryDependencies>): DeliveryDependencies;
  context(): ListenerContext;
  /** A new active member; `email: null` is staff without email. */
  addMember(email: string | null): string;
  /** Saves a push subscription for the member on a known push service, and returns its endpoint. */
  subscribe(userId: string, name: string): Promise<string>;
  /** Notifies the member by email and push, returns the notification id and the event that asks for delivery. */
  notifyMember(
    userId: string,
    overrides?: { title?: string; body?: string; channels?: ("email" | "push")[] },
  ): Promise<{ id: string; event: DomainEvent }>;
  row(id: string): Promise<{
    emailedAt: Date | null;
    emailClaimedAt: Date | null;
    emailFailedAt: Date | null;
    pushedAt: Date | null;
    pushClaimedAt: Date | null;
    pushFailedAt: Date | null;
  }>;
}

/** Call inside a describe: sets up and tears down the kit around its tests. */
export function useDeliveryKit(name: string): DeliveryKit {
  const contacts: MemberContact[] = [];
  const kit = {} as DeliveryKit;
  const state = kit as { -readonly [K in keyof DeliveryKit]: DeliveryKit[K] };

  beforeAll(async () => {
    const urls = inject("dbUrls");
    state.platform = createPlatformClient(urls.platform);
    state.db = createDatabase(urls.runtime, { maxConnections: 6 });
    state.organizationId = await createTestOrganization(kit.platform, name);
  });

  beforeEach(() => {
    state.email = createMemoryEmailSender();
    state.push = createMemoryPushSender();
    state.logs = [];
    state.profile = {
      id: kit.organizationId,
      name: "Sharma Travels",
      code: "SHARMA",
      timeZone: "Asia/Kolkata",
      contactEmail: "hello@sharma.example",
    };
  });

  afterAll(async () => {
    await kit.db.disconnect();
    await kit.platform.$disconnect();
  });

  state.dependencies = (overrides = {}) => ({
    email: kit.email,
    push: kit.push,
    organizationProfile: () => Promise.resolve(kit.profile),
    memberContacts: (_organizationId, userIds) =>
      Promise.resolve(contacts.filter((contact) => userIds.includes(contact.userId))),
    appUrl: "https://app.example",
    log: (message) => kit.logs.push(message),
    ...overrides,
  });
  state.context = () => ({
    actor: systemActor(kit.organizationId),
    forOrg: (fn) => kit.db.forOrg(kit.organizationId, fn),
  });
  state.addMember = (email) => {
    const userId = randomUUID();
    contacts.push({ userId, name: email === null ? "Staff" : "Asha Owner", email });
    return userId;
  };
  state.subscribe = async (userId, subscriptionName) => {
    const endpoint = `https://fcm.googleapis.com/fcm/send/${subscriptionName}-${randomUUID()}`;
    await kit.db.forOrg(kit.organizationId, (tx) =>
      savePushSubscription(tx, personIn(kit.organizationId, userId), { endpoint, keys }),
    );
    return endpoint;
  };
  state.notifyMember = async (userId, overrides = {}) => {
    const [id] = await kit.db.forOrg(kit.organizationId, (tx) =>
      notify(tx, systemActor(kit.organizationId), {
        recipientUserIds: [userId],
        kind: "share-link.opened",
        title: overrides.title ?? "Quotation opened",
        body: overrides.body ?? "Meera opened Quotation QT-2026-0042",
        link: "/quotes/42",
        channels: overrides.channels ?? ["email", "push"],
      }),
    );
    const event = (await eventsOfType(kit.db, kit.organizationId, "notification.created")).find(
      (candidate) => candidate.payload.notificationId === id,
    );
    if (!id || !event) throw new Error("notify() published no delivery event");
    return { id, event };
  };
  state.row = (id) =>
    kit.db.forOrg(kit.organizationId, (tx) =>
      tx.notification.findUniqueOrThrow({
        where: { id },
        select: {
          emailedAt: true,
          emailClaimedAt: true,
          emailFailedAt: true,
          pushedAt: true,
          pushClaimedAt: true,
          pushFailedAt: true,
        },
      }),
    );

  return kit;
}

/** Runs the delivery listener on an event, as the worker would. */
export function deliver(kit: DeliveryKit, event: DomainEvent, overrides: Partial<DeliveryDependencies> = {}) {
  return deliverNotificationListener(kit.dependencies(overrides)).handle(event, kit.context());
}

/** `target` with some of its members replaced; every other member is the real one. */
function overriding<T extends object>(target: T, replacements: Partial<T>): T {
  return new Proxy(target, {
    get: (real, property, receiver) =>
      property in replacements
        ? (replacements as Record<string | symbol, unknown>)[property]
        : (Reflect.get(real, property, receiver) as unknown),
  });
}

/**
 * A listener context whose database breaks in one place: "pushSubscription" can't delete rows, and "releasing" can't
 * clear an email claim. Everything else works.
 */
export function failing(kit: DeliveryKit, what: "pushSubscription" | "releasing"): ListenerContext {
  const broken = () => Promise.reject(new Error("db down"));
  return {
    actor: kit.context().actor,
    forOrg: (fn) =>
      kit.context().forOrg((tx) =>
        fn(
          what === "pushSubscription"
            ? overriding(tx, { pushSubscription: overriding(tx.pushSubscription, { deleteMany: broken as never }) })
            : overriding(tx, {
                notification: overriding(tx.notification, {
                  updateMany: ((args: Parameters<OrgTx["notification"]["updateMany"]>[0]) =>
                    "emailClaimedAt" in args.data && args.data.emailClaimedAt === null
                      ? broken()
                      : tx.notification.updateMany(args)) as never,
                }),
              }),
        ),
      ),
  };
}
