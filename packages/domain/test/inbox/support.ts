// What the inbox module's tests need: an agency with a connected WhatsApp number routed to it (and a second number), the
// in-memory MSG91, the files module on in-memory storage, the job queue and log, the agency facts (an Owner, workers, a
// subscription that allows changes unless the test turns it off), the webhook bodies MSG91 would send, and the worker's
// sender, to see which number a message left from.
import { randomUUID } from "node:crypto";
import type { Entitlements } from "../../src/subscriptions/index.js";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryLogger, type MemoryLogger } from "@travel-crm/integrations/logging";
import {
  createMemoryWhatsAppProvider,
  inboundBody,
  msg91Signer,
  statusBody,
  type InboundBodyInput,
  type MemoryWhatsAppProvider,
} from "@travel-crm/integrations/whatsapp";
import { createRateLimiter } from "../../src/rate-limits/index.js";
import { upsertRoute, type InboxDependencies } from "../../src/inbox/index.js";
import { processWhatsAppBody, sendQueued } from "../../src/inbox/index.js";
import { newUuidV7 } from "../../src/kernel/index.js";
import { anAgency, createTestImports, listenerContext, type TestImports } from "../imports/support/test-imports.js";
import { freshPhone } from "../crm/support/records.js";

export { eventsOf } from "../imports/support/test-imports.js";
export { freshPhone };

export const testNow = new Date("2026-10-23T10:00:00Z");
export const signer = msg91Signer({ token: "t".repeat(40), key: "k".repeat(40) });

export interface TestInbox extends TestImports {
  provider: MemoryWhatsAppProvider;
  queue: MemoryJobQueue;
  logger: MemoryLogger;
  dependencies: InboxDependencies;
  /** The subscription's access as the next checks see it. */
  setAccess(access: "full" | "read_only"): void;
}

export function createTestInbox(): TestInbox {
  const base = createTestImports();
  const provider = createMemoryWhatsAppProvider({ now: testNow });
  const queue = createMemoryJobQueue();
  const logger = createMemoryLogger();
  let access: "full" | "read_only" = "full";
  const owners = new Map<string, string>();
  const entitlements = (): Entitlements => ({
    status: "active",
    access,
    planName: "Test",
    planKey: "starter",
    modules: new Set(["crm", "inbox"]),
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1e9 },
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
  });
  const dependencies: InboxDependencies = {
    db: base.db,
    provider,
    files: base.files,
    queue,
    logger,
    limiter: createRateLimiter(base.db, { keySecret: "k".repeat(40) }),
    identity: {
      firstOwner: (organizationId) => {
        const owner = owners.get(organizationId) ?? randomUUID();
        owners.set(organizationId, owner);
        return Promise.resolve(owner);
      },
      leadWorkers: (organizationId) => {
        const owner = owners.get(organizationId) ?? randomUUID();
        owners.set(organizationId, owner);
        return Promise.resolve([{ userId: owner, name: "Owner" }]);
      },
      organizationProfile: () => Promise.resolve(null),
    },
    subscriptions: { entitlementsOf: () => Promise.resolve(entitlements()) },
    managers: (organizationId) => Promise.resolve([owners.get(organizationId) ?? randomUUID()]),
  };
  return { ...base, provider, queue, logger, dependencies, setAccess: (value) => (access = value) };
}

let nextNumber = Math.floor(Math.random() * 9e6);
/** A number MSG91 would call ours: digits, unique to the test. */
export const aBusinessNumber = () => `9188${String((nextNumber += 1)).padStart(8, "0")}`;

export interface TestConnection {
  organizationId: string;
  connectionId: string;
  integratedNumber: string;
}

/**
 * An agency with its main number in the given status (connected unless told), routed as the route listener would; a new
 * agency unless `organizationId` names one another test made.
 */
export async function aConnectedAgency(
  test: TestInbox,
  options: { status?: string; organizationId?: string } = {},
): Promise<TestConnection> {
  const organizationId = options.organizationId ?? (await anAgency(test));
  const integratedNumber = aBusinessNumber();
  test.provider.addNumber(integratedNumber);
  const connectionId = await test.db.forOrg(organizationId, async (tx) => {
    const connection = await tx.whatsappConnection.create({
      data: {
        integratedNumber,
        displayNumber: `+${integratedNumber}`,
        mode: "new_number",
        status: options.status ?? "connected",
        isMain: true,
        connectedAt: testNow,
      },
      select: { id: true },
    });
    return connection.id;
  });
  await upsertRoute(test.db, { integratedNumber, organizationId, connectionId });
  return { organizationId, connectionId, integratedNumber };
}

/**
 * A second number in the agency of `first`, routed (unless disconnected: a disconnect removes the route); "Sales 2" and
 * connected unless told. `main` moves the main flag to it.
 */
export async function aSecondNumber(
  test: TestInbox,
  first: TestConnection,
  options: { label?: string; status?: string; main?: boolean } = {},
): Promise<TestConnection> {
  const integratedNumber = aBusinessNumber();
  test.provider.addNumber(integratedNumber);
  const status = options.status ?? "connected";
  const connectionId = await test.db.forOrg(first.organizationId, async (tx) => {
    if (options.main === true) {
      await tx.whatsappConnection.updateMany({ where: { isMain: true }, data: { isMain: false } });
    }
    const connection = await tx.whatsappConnection.create({
      data: {
        integratedNumber,
        displayNumber: `+${integratedNumber}`,
        mode: "new_number",
        status,
        label: options.label ?? "Sales 2",
        isMain: options.main === true,
        connectedAt: testNow,
      },
      select: { id: true },
    });
    return connection.id;
  });
  const organizationId = first.organizationId;
  if (status !== "disconnected") await upsertRoute(test.db, { integratedNumber, organizationId, connectionId });
  return { organizationId, connectionId, integratedNumber };
}

/** The customer writes to `before` two hours before `at`, then to `last` an hour before it; their chat on `last`. */
export async function lastWroteTo(
  test: TestInbox,
  phoneE164: string,
  last: TestConnection,
  before: TestConnection,
  at: Date = testNow,
): Promise<string> {
  for (const [connection, hours] of [
    [before, 2],
    [last, 1],
  ] as const) {
    const when = new Date(at.getTime() - hours * 3_600_000);
    const customerNumber = phoneE164.replace("+", "");
    await deliver(test, fromCustomer(connection, { customerNumber, text: "Hello", ts: when.getTime() / 1000 }), when);
  }
  const chat = await test.db.forOrg(last.organizationId, (tx) =>
    tx.whatsappConversation.findFirstOrThrow({
      where: { connectionId: last.connectionId, phoneE164 },
      select: { id: true },
    }),
  );
  return chat.id;
}

/** Runs the worker's sender on a queued message; the number MSG91 was asked to send from, or null for none. */
export async function sentFrom(
  test: TestInbox,
  organizationId: string,
  messageId: string,
  at: Date = testNow,
): Promise<string | null> {
  await sendQueued(
    {
      provider: test.provider,
      files: test.files,
      limiter: test.dependencies.limiter,
      logger: test.logger,
      managers: test.dependencies.managers,
    },
    listenerContext(test, organizationId),
    { id: newUuidV7(), messageId },
    at,
  );
  // By the message's own wamid, so sends of other tests running beside it are never taken for it.
  const row = await test.db.forOrg(organizationId, (tx) =>
    tx.whatsappMessage.findUnique({ where: { id: messageId }, select: { wamid: true } }),
  );
  const wamid = row?.wamid ?? null;
  return wamid === null ? null : (test.provider.sent.find((sent) => sent.wamid === wamid)?.number ?? null);
}

export const fromCustomer = (
  connection: TestConnection,
  input: Partial<InboundBodyInput> & { customerNumber: string },
) => inboundBody({ integratedNumber: connection.integratedNumber, wamid: `wamid.${randomUUID()}`, ...input });

export const statusFor = (
  connection: TestConnection,
  input: {
    customerNumber: string;
    wamid: string;
    eventName: "sent" | "delivered" | "read" | "failed";
    reason?: string;
    ts?: number;
  },
) => statusBody({ integratedNumber: connection.integratedNumber, ...input });

/** Delivers a body to the provider's work, as the worker does after the intake stored it. */
export function deliver(test: TestInbox, body: object | readonly object[], now: Date = testNow) {
  const found: { organizationId: string | null } = { organizationId: null };
  const events = Array.isArray(body) ? body : [body];
  return processWhatsAppBody(
    test.dependencies,
    { isAbout: (id) => (found.organizationId = id) },
    signer.body(events as readonly object[]),
    now,
  ).then(() => found.organizationId);
}

export { upsertRoute };
