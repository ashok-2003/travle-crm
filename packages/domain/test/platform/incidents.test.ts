// The system's health: a report opens an incident of its kind, a second report of an open one is counted on it, the
// incident jobs every process sends are recorded, and the list says what is open.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { incidentHandler, listPlatformIncidents, reportPlatformIncident } from "../../src/platform/index.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("the system's health", () => {
  let test: TestPlatform;
  beforeAll(() => {
    test = createTestPlatform();
  });
  afterAll(async () => {
    await test.close();
  });

  it("opens one incident per kind, and counts the reports of an open one", async () => {
    const now = new Date();
    await reportPlatformIncident(test.services, "ai.unavailable", "autopilot", now);
    await reportPlatformIncident(test.services, "ai.unavailable", "score_lead", new Date(now.getTime() + 60_000));
    const { open } = await listPlatformIncidents(test.services);
    const ai = open.filter((incident) => incident.kind === "ai.unavailable");
    expect(ai).toHaveLength(1);
    expect(ai[0]).toMatchObject({ detail: "score_lead", reports: 2, resolvedAt: null });
  });

  it("records the incident jobs every process sends, and refuses one of no known kind", async () => {
    const handler = incidentHandler(test.services);
    await handler.handle({ kind: "api.errors", detail: "/api/trpc TypeError" });
    const { open } = await listPlatformIncidents(test.services);
    expect(open.map((incident) => incident.kind)).toContain("api.errors");
    await expect(handler.handle({ kind: "disk.full", detail: "" })).rejects.toThrow();
  });
});
