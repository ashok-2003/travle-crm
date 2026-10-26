// broadcasts.* through the HTTP app (sales inbox spec 6): only the Owner and Admins may call any of it, a preview shows counts
// and an allowance and never a rupee, a create with the same request id is one broadcast, and cancel stops what waits.
import { randomUUID } from "node:crypto";
import type { BroadcastDetail, BroadcastPreview } from "@travel-crm/contracts/inbox";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CookieJar } from "./support/cookie-jar.js";
import { addStaff, signedInOwner, signedInStaff } from "./support/people.js";
import { createTestAgency, createTestServer, type TestAgency, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

describe("broadcasts, through the api", () => {
  let server: TestServer;
  let agency: TestAgency;
  let owner: CookieJar;
  let seller: CookieJar;
  let input: { templateId: string; tagIds: string[]; params: string[] };

  beforeAll(async () => {
    server = createTestServer();
    agency = await createTestAgency(server);
    owner = await signedInOwner(server, agency);
    seller = await signedInStaff(
      server,
      agency,
      await addStaff(server, agency, { username: "asha", roleKey: "sales" }),
    );
    input = await server.db.forOrg(agency.organizationId, async (tx) => {
      const connection = await tx.whatsappConnection.create({
        data: {
          integratedNumber: "919800000001",
          displayNumber: "+919800000001",
          mode: "new_number",
          status: "connected",
        },
      });
      const template = await tx.whatsappTemplate.create({
        data: {
          connectionId: connection.id,
          name: "offer",
          language: "en",
          category: "marketing",
          body: "Hi {{1}}",
          status: "approved",
        },
      });
      const tag = await tx.inboxTag.create({ data: { name: "Goa" } });
      for (const consent of ["granted", "granted", "withdrawn"]) {
        const person = await tx.person.create({
          data: { name: "Customer", phoneE164: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
        });
        await tx.personConsent.create({
          data: {
            personId: person.id,
            purpose: "whatsapp",
            action: consent,
            wording: "t",
            wordingVersion: 1,
            source: "staff",
            recordedAt: new Date(),
          },
        });
        const chat = await tx.whatsappConversation.create({
          data: { connectionId: connection.id, phoneE164: person.phoneE164 ?? "", personId: person.id },
        });
        await tx.conversationTag.create({ data: { conversationId: chat.id, tagId: tag.id } });
      }
      return { templateId: template.id, tagIds: [tag.id], params: ["there"] };
    });
  });
  afterAll(() => server.close());

  it("keeps every procedure from someone who does not write templates", async () => {
    expect((await refusalOf(await query(server, "broadcasts.list", seller))).status).toBe(403);
    expect((await refusalOf(await mutate(server, "broadcasts.preview", input, seller))).status).toBe(403);
    expect(
      (await refusalOf(await mutate(server, "broadcasts.create", { requestId: randomUUID(), ...input }, seller)))
        .status,
    ).toBe(403);
  });

  it("previews counts and an allowance, creates once per request id, and cancels what waits", async () => {
    const preview = await dataOf<BroadcastPreview>(await mutate(server, "broadcasts.preview", input, owner));
    expect(preview).toMatchObject({ willSend: 2, leftOut: { optedOut: 1 }, allowance: { limit: 300, remaining: 300 } });
    expect(JSON.stringify(preview)).not.toMatch(/paise|rupee|₹|price|cost/i);
    const requestId = randomUUID();
    const first = await dataOf<{ id: string }>(
      await mutate(server, "broadcasts.create", { requestId, ...input }, owner),
    );
    const again = await dataOf<{ id: string }>(
      await mutate(server, "broadcasts.create", { requestId, ...input }, owner),
    );
    expect(again.id).toBe(first.id);
    const detail = await dataOf<BroadcastDetail>(
      await query(server, "broadcasts.get", owner, { broadcastId: first.id }),
    );
    expect(detail.broadcast).toMatchObject({
      status: "sending",
      templateName: "offer",
      tagNames: ["Goa"],
      counts: { total: 2, waiting: 2 },
    });
    await dataOf(await mutate(server, "broadcasts.cancel", { broadcastId: first.id }, owner));
    const after = await dataOf<BroadcastDetail>(
      await query(server, "broadcasts.get", owner, { broadcastId: first.id }),
    );
    expect(after.broadcast).toMatchObject({ status: "cancelled", counts: { skipped: 2, waiting: 0 } });
    expect((await refusalOf(await mutate(server, "broadcasts.resume", { broadcastId: first.id }, owner))).reason).toBe(
      "BROADCAST_NOT_PAUSED",
    );
  });

  it("reads the session from the database: a session that is gone is refused, though its cookie is still fresh", async () => {
    const stale = await signedInOwner(server, agency);
    expect((await refusalOf(await query(server, "broadcasts.list", stale))).status).not.toBe(401);
    await server.platform.session.deleteMany({ where: { userId: agency.owner.userId } });
    expect((await refusalOf(await query(server, "broadcasts.list", stale))).status).toBe(401);
    expect((await refusalOf(await mutate(server, "broadcasts.preview", input, stale))).status).toBe(401);
  });
});
