// What the inbox module's tests need: an agency with a connected WhatsApp number routed to it, the in-memory MSG91, the files
// module on in-memory storage, the job queue and log, the agency facts (an Owner, workers, a subscription that allows
// changes unless the test turns it off), and the webhook bodies MSG91 would send.
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
import { upsertRoute, type InboxDependencies } from "../../src/inbox/index.js";
import { processWhatsAppBody } from "../../src/inbox/index.js";
import { anAgency, createTestImports, type TestImports } from "../imports/support/test-imports.js";
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

/** An agency with a number in the given status (connected unless told), routed as the route listener would. */
export async function aConnectedAgency(test: TestInbox, options: { status?: string } = {}): Promise<TestConnection> {
  const organizationId = await anAgency(test);
  const integratedNumber = aBusinessNumber();
  test.provider.addNumber(integratedNumber);
  const connectionId = await test.db.forOrg(organizationId, async (tx) => {
    const connection = await tx.whatsappConnection.create({
      data: {
        integratedNumber,
        displayNumber: `+${integratedNumber}`,
        mode: "new_number",
        status: options.status ?? "connected",
        connectedAt: testNow,
      },
      select: { id: true },
    });
    return connection.id;
  });
  await upsertRoute(test.db, { integratedNumber, organizationId, connectionId });
  return { organizationId, connectionId, integratedNumber };
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
