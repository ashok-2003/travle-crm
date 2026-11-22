// The live hub's reads (inbox revamp spec, part 1 item 4): a burst of notifications (a broadcast's delivery reports, a
// reply's queued, sent and read) reads each organization's chats once, together, and never more than two reads at once.
import { randomUUID } from "node:crypto";
import type { ChatAudience } from "@travel-crm/domain/inbox";
import { PermissionSet } from "@travel-crm/domain/identity";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { describe, expect, it } from "vitest";
import { createLiveHub, READS_AT_ONCE, type LiveStream } from "../src/live-hub.js";

function aStream(organizationId: string, heard: string[]): LiveStream {
  return {
    access: {
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
    },
    send: (event) => heard.push(`${event.conversationId}:${event.change}`),
    close: () => undefined,
    recheckSoon: () => undefined,
  };
}

describe("the live hub's reads", () => {
  it("reads a burst's chats once per organization, two reads at most at once, and sends every change", async () => {
    const reads: { organizationId: string; chats: number }[] = [];
    let running = 0;
    let most = 0;
    const hub = createLiveHub({
      logger: createMemoryLogger(),
      audiencesOf: async (organizationId, ids) => {
        running += 1;
        most = Math.max(most, running);
        reads.push({ organizationId, chats: ids.length });
        await new Promise((resolve) => setTimeout(resolve, 20));
        running -= 1;
        return new Map<string, ChatAudience>(ids.map((id) => [id, { listed: true, leadOwners: [] }]));
      },
    });
    const organizations = Array.from({ length: 4 }, () => randomUUID());
    const heard = organizations.map(() => [] as string[]);
    organizations.forEach((organizationId, index) => hub.join(aStream(organizationId, heard[index] ?? [])));
    // 50 delivery reports for a broadcast in each organization.
    const chats = Array.from({ length: 50 }, () => randomUUID());
    for (const organizationId of organizations) {
      for (const conversationId of chats) hub.deliver({ organizationId, conversationId, change: "status" });
    }
    await hub.settled();
    expect(reads).toHaveLength(organizations.length);
    expect(reads.every((read) => read.chats === chats.length)).toBe(true);
    expect(most).toBeLessThanOrEqual(READS_AT_ONCE);
    expect(heard.map((events) => events.length)).toEqual([50, 50, 50, 50]);
  });

  it("reads nothing for an organization nobody streams", async () => {
    let reads = 0;
    const hub = createLiveHub({
      logger: createMemoryLogger(),
      audiencesOf: () => {
        reads += 1;
        return Promise.resolve(new Map());
      },
    });
    hub.deliver({ organizationId: randomUUID(), conversationId: randomUUID(), change: "message" });
    await hub.settled();
    expect(reads).toBe(0);
  });
});
