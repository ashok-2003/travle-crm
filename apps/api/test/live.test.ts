// GET /api/live (inbox revamp spec, part 1 item 4): the Inbox's live stream answers a signed-in member who may read the
// inbox, refuses everyone else, sends each member events for the chats they may see (a chat's id and what changed, nothing
// more) as the database notifies them, keeps quiet streams alive with a comment, ends a stream whose access lapsed, and
// holds a member to five streams.
import { INBOX_LIVE_CHANNEL, listenForNotifications, type NotificationListener } from "@travel-crm/db";
import { chatAudiencesOf, parseInboxNotification } from "@travel-crm/domain/inbox";
import { createMemoryLogger } from "@travel-crm/integrations/logging";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLiveHub } from "../src/live-hub.js";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff, type TestStaff } from "./support/people.js";
import { dataOf, mutate } from "./support/trpc.js";
import {
  createTestAgency,
  createTestServer,
  everyRequestReads,
  ORIGIN,
  type TestAgency,
  type TestServer,
} from "./support/test-server.js";

const digits = () => String(Math.floor(Math.random() * 1e10)).padStart(10, "0");

/** An open stream, read as a browser's EventSource would: what it has received so far, and a way to close it. */
interface OpenStream {
  response: Response;
  text(): string;
  events(): { event: string; data: Record<string, unknown> }[];
  waitFor(check: (text: string) => boolean, what: string): Promise<void>;
  close(): Promise<void>;
}

async function openStream(
  server: TestServer,
  jar?: CookieJar,
  headers: Record<string, string> = {},
): Promise<OpenStream> {
  const response = await server.app.request("/api/live", {
    headers: { ...(jar === undefined ? {} : { cookie: jar.header }), ...headers },
  });
  let received = "";
  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined = response.body?.getReader();
  const decoder = new TextDecoder();
  let reading = Promise.resolve();
  if (response.ok && reader !== undefined) {
    reading = (async () => {
      for (;;) {
        const chunk = await reader.read().catch(() => null);
        if (chunk === null || chunk.done) return;
        received += decoder.decode(chunk.value, { stream: true });
      }
    })();
  }
  const events = () =>
    received
      .split("\n\n")
      .filter((block) => block.startsWith("event: "))
      .map((block) => {
        const [eventLine = "", dataLine = ""] = block.split("\n");
        return {
          event: eventLine.slice("event: ".length),
          data: JSON.parse(dataLine.slice("data: ".length)) as Record<string, unknown>,
        };
      });
  return {
    response,
    text: () => received,
    events,
    waitFor: async (check, what) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (check(received)) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error(`The stream never showed ${what}: ${received}`);
    },
    close: async () => {
      await reader?.cancel().catch(() => undefined);
      await reading;
    },
  };
}

describe("the Inbox's live stream", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let seller: { staff: TestStaff; jar: CookieJar };
  let accounts: CookieJar;
  let listener: NotificationListener;
  let connectionId: string;
  const hub = createLiveHub({
    audiencesOf: (organizationId, conversationIds) => chatAudiencesOf(server.db, organizationId, conversationIds),
    logger: createMemoryLogger(),
  });

  /** A chat in the agency, its person's lead owned by `ownerUserId` (no person when undefined). */
  const aChat = (ownerUserId?: string | null) =>
    server.db.forOrg(agency.organizationId, async (tx) => {
      const person =
        ownerUserId === undefined
          ? null
          : await tx.person.create({ data: { name: "Meera Rao", phoneE164: `+91${digits()}` }, select: { id: true } });
      if (person !== null) {
        await tx.lead.create({ data: { personId: person.id, source: "whatsapp", ownerUserId: ownerUserId ?? null } });
      }
      const chat = await tx.whatsappConversation.create({
        data: { connectionId, phoneE164: `+91${digits()}`, personId: person?.id ?? null },
        select: { id: true },
      });
      return chat.id;
    });

  const customerWrites = (conversationId: string) =>
    server.db.forOrg(agency.organizationId, (tx) =>
      tx.whatsappMessage.create({
        data: {
          conversationId,
          direction: "in",
          origin: "customer",
          kind: "text",
          body: "Is the Goa trip still on?",
          status: "received",
          occurredAt: new Date(),
        },
      }),
    );

  beforeAll(async () => {
    // Access read on every request; a stream reads it again only when its organization's access changed (its regular
    // reading, every few minutes, is out of the tests' reach).
    server = createTestServer(
      {},
      { live: { hub, heartbeatMs: 200, recheckMs: 600_000 }, accessCache: everyRequestReads },
    );
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    const sellerStaff = await addStaff(server, agency, { username: `seller${digits()}`, roleKey: "sales" });
    seller = { staff: sellerStaff, jar: await signedInStaff(server, agency, sellerStaff) };
    accounts = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: `accounts${digits()}`, roleKey: "accounts" }),
    );
    connectionId = await server.db.forOrg(agency.organizationId, async (tx) => {
      const row = await tx.whatsappConnection.create({
        data: {
          integratedNumber: `91${digits()}`,
          displayNumber: "+910000000000",
          mode: "new_number",
          status: "connected",
          connectedAt: new Date(),
        },
        select: { id: true },
      });
      return row.id;
    });
    // As the api's server.ts does: the database's notifications, into the hub.
    listener = listenForNotifications(server.urls.runtime, INBOX_LIVE_CHANNEL, {
      onNotification: (payload) => {
        const notification = parseInboxNotification(payload);
        if (notification !== null) hub.deliver(notification);
      },
    });
    await listener.listening;
  });

  afterAll(async () => {
    hub.closeAll();
    await listener.close();
    await server.close();
  });

  it("refuses nobody signed in (401), a member without the inbox (403) and another site (403)", async () => {
    expect((await server.app.request("/api/live")).status).toBe(401);
    const refused = await server.app.request("/api/live", { headers: { cookie: accounts.header } });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ reason: "MISSING_PERMISSION" });
    const crossSite = await server.app.request("/api/live", {
      headers: { cookie: owner.header, origin: "https://elsewhere.example" },
    });
    expect(crossSite.status).toBe(403);
    expect(hub.size()).toBe(0);
  });

  it("streams events that no cache or proxy may hold back, with its own retry and a comment to keep it alive", async () => {
    const stream = await openStream(server, owner, { origin: ORIGIN });
    try {
      expect(stream.response.status).toBe(200);
      expect(stream.response.headers.get("content-type")).toContain("text/event-stream");
      expect(stream.response.headers.get("cache-control")).toBe("no-store, no-transform");
      await stream.waitFor((text) => text.includes(": keep-alive\n\n"), "a heartbeat");
      // Between 3 and 10 s, a wait of its own, so streams ended together don't all come back in the same second.
      const retry = Number(/^retry: (\d+)\n\n/.exec(stream.text())?.[1]);
      expect(retry).toBeGreaterThanOrEqual(3_000);
      expect(retry).toBeLessThan(10_000);
    } finally {
      await stream.close();
    }
  });

  it("tells each member of the chats they may see, by id and what changed alone", async () => {
    const sellers = await aChat(seller.staff.userId);
    const unassigned = await aChat(null);
    const ownerStream = await openStream(server, owner);
    const sellerStream = await openStream(server, seller.jar);
    try {
      await customerWrites(unassigned);
      await customerWrites(sellers);
      await sellerStream.waitFor((text) => text.includes(sellers), "the seller's chat");
      await ownerStream.waitFor((text) => text.includes(sellers), "the seller's chat, for the Owner");
      // Each change is sent as its chat's audience is read, so two close together may cross.
      await ownerStream.waitFor((text) => text.includes(unassigned), "the unassigned chat, for the Owner");
      expect(ownerStream.events()).toHaveLength(2);
      expect(ownerStream.events()).toEqual(
        expect.arrayContaining([
          { event: "inbox", data: { conversationId: unassigned, change: "message", direction: "in" } },
          { event: "inbox", data: { conversationId: sellers, change: "message", direction: "in" } },
        ]),
      );
      // The seller sees their own leads' chats only: the unassigned one, before it, never reached them.
      expect(sellerStream.events()).toEqual([
        { event: "inbox", data: { conversationId: sellers, change: "message", direction: "in" } },
      ]);
      expect(ownerStream.text()).not.toContain("Goa");
    } finally {
      await ownerStream.close();
      await sellerStream.close();
    }
  });

  it("ends a stream at its next beat once its member's new role no longer reads the inbox", async () => {
    const staff = await addStaff(server, agency, { username: `moving${digits()}`, roleKey: "sales" });
    const stream = await openStream(server, await signedInStaff(server, agency, staff));
    expect(stream.response.status).toBe(200);
    expect(hub.size()).toBe(1);
    // The Owner moves them to Accounts in the app: the organization's access changed, so its streams read theirs again.
    await dataOf(await mutate(server, "staff.updateRole", { memberId: staff.memberId, roleKey: "accounts" }, owner));
    for (let attempt = 0; attempt < 100 && hub.size() > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(hub.size()).toBe(0);
    await stream.close();
  });

  it("holds a member to five streams, and a closed one frees its place", async () => {
    const streams = await Promise.all(Array.from({ length: 5 }, () => openStream(server, seller.jar)));
    try {
      expect(streams.map((stream) => stream.response.status)).toEqual([200, 200, 200, 200, 200]);
      const sixth = await server.app.request("/api/live", { headers: { cookie: seller.jar.header } });
      expect(sixth.status).toBe(429);
      expect(await sixth.json()).toMatchObject({ code: "TOO_MANY_STREAMS" });
      // Someone else is not counted against the seller.
      const ownerStream = await openStream(server, owner);
      expect(ownerStream.response.status).toBe(200);
      await ownerStream.close();
      await streams[0]?.close();
      for (let attempt = 0; attempt < 100 && hub.size() > 4; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const again = await openStream(server, seller.jar);
      expect(again.response.status).toBe(200);
      await again.close();
    } finally {
      await Promise.all(streams.map((stream) => stream.close()));
    }
  });

  it("keeps no stream once every browser has gone", async () => {
    for (let attempt = 0; attempt < 100 && hub.size() > 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(hub.size()).toBe(0);
  });
});
