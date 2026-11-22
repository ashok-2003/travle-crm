// The live stream's access reads (inbox revamp spec, part 1 item 4): an organization whose access changes again and again (a
// busy agency's every change) makes each stream read its member's access at most once per gap, not at every beat.
import { randomUUID } from "node:crypto";
import { PermissionSet, type MemberAccess } from "@travel-crm/domain/identity";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createLiveHub } from "../src/live-hub.js";
import { liveRoute } from "../src/live-route.js";

const organizationId = randomUUID();
const access: MemberAccess = {
  userId: randomUUID(),
  memberId: randomUUID(),
  organizationId,
  source: "web",
  impersonatedBy: null,
  role: { key: "org-owner", name: "Owner", isOwner: true },
  permissions: PermissionSet.everything(),
  mustChangePassword: false,
  twoFactorEnabled: false,
  organizationRequiresTwoFactor: false,
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("a stream's access reads", () => {
  it("reads access again at most once per gap, however often the organization's access changes", async () => {
    let reads = 0;
    const hub = createLiveHub({ logger: createMemoryLogger(), audiencesOf: () => Promise.resolve(new Map()) });
    const app = new Hono().route(
      "/api/live",
      liveRoute({
        hub,
        logger: createMemoryLogger(),
        trustedOrigin: () => Promise.resolve(true),
        memberOf: () => {
          reads += 1;
          return Promise.resolve(access);
        },
        heartbeatMs: 20,
        recheckMs: 600_000,
        recheckGapMs: 300,
      }),
    );
    const response = await app.request("/api/live");
    const reader = response.body?.getReader();
    expect(reads).toBe(1);
    // Ten changes a second for a second: the open's read, then one per 300 ms gap, not one per 20 ms beat (50).
    for (let change = 0; change < 10; change += 1) {
      hub.forgetOrganization(organizationId);
      await pause(100);
    }
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(reads).toBeLessThanOrEqual(5);
    // Quiet again: the last change's read, then no more.
    await pause(400);
    const settled = reads;
    await pause(400);
    expect(reads).toBe(settled);
    await reader?.cancel();
  });
});
