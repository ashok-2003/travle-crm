// A listener runs once per event, in the event's own organization, as the system: a repeat is skipped, a failure is
// retried until it succeeds once, and a job naming the wrong organization finds nothing.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent, runListenerJob, type ListenerContext } from "../../src/jobs/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { recordingListener } from "./test-listeners.js";

describe("runListenerJob", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let otherOrganizationId: string;

  const publishIssued = (documentId: string) =>
    db.forOrg(organizationId, (tx) => publishEvent(tx, { type: "document.issued", payload: { documentId } }));
  const jobFor = (eventId: string, overrides: Record<string, string> = {}) => ({
    organizationId,
    eventId,
    eventType: "document.issued",
    ...overrides,
  });

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Listener runs");
    otherOrganizationId = await createTestOrganization(platform, "Listener elsewhere");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("handles an event once, and skips it when the job comes again", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const eventId = await publishIssued("d1");

    expect(await runListenerJob({ db, listener, data: jobFor(eventId) })).toBe("handled");
    expect(await runListenerJob({ db, listener, data: jobFor(eventId) })).toBe("already-handled");
    expect(listener.handled.map((event) => [event.id, event.payload])).toEqual([[eventId, { documentId: "d1" }]]);
  });

  it("keeps listeners apart: another listener of the same event still runs", async () => {
    const eventId = await publishIssued("d2");
    const render = recordingListener("documents.render-pdf", "document.issued");
    const notify = recordingListener("notifications.document-issued", "document.issued");
    await runListenerJob({ db, listener: render, data: jobFor(eventId) });
    expect(await runListenerJob({ db, listener: notify, data: jobFor(eventId) })).toBe("handled");
  });

  it("rejects when the listener fails, and handles the event once on the retry", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    listener.failuresLeft = 1;
    const eventId = await publishIssued("d3");

    await expect(runListenerJob({ db, listener, data: jobFor(eventId) })).rejects.toThrow("failed on purpose");
    expect(await runListenerJob({ db, listener, data: jobFor(eventId) })).toBe("handled");
    expect(listener.handled).toHaveLength(1);
  });

  it("gives the listener the system as actor and a forOrg bound to the event's organization", async () => {
    let seen: { actor: ListenerContext["actor"]; eventVisible: boolean } | undefined;
    const listener = recordingListener("documents.render-pdf", "document.issued", async (event, context) => {
      const row = await context.forOrg((tx) => tx.outboxEvent.findUnique({ where: { id: event.id } }));
      seen = { actor: context.actor, eventVisible: row !== null };
    });
    const eventId = await publishIssued("d4");
    await runListenerJob({ db, listener, data: jobFor(eventId) });
    expect(seen).toEqual({ actor: systemActor(organizationId), eventVisible: true });
  });

  it("finds no event when the job names another organization, and doesn't run the listener", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const eventId = await publishIssued("d5");
    expect(await runListenerJob({ db, listener, data: jobFor(eventId, { organizationId: otherOrganizationId }) })).toBe(
      "event-not-found",
    );
    expect(listener.handled).toEqual([]);
  });

  it("refuses a job that isn't for this listener's event type, or has no valid ids", async () => {
    const listener = recordingListener("documents.render-pdf", "document.issued");
    const eventId = await publishIssued("d6");
    await expect(
      runListenerJob({ db, listener, data: jobFor(eventId, { eventType: "notification.created" }) }),
    ).rejects.toThrow(/listens to document.issued/);
    await expect(runListenerJob({ db, listener, data: { eventType: "document.issued" } })).rejects.toThrow(
      /organizationId/,
    );
  });
});
