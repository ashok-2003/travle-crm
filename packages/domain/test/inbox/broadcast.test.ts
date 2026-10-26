// Broadcasts (sales inbox spec 6, rebuilt 2026-10-26): the preview says who is reached and who is left out and why; confirming
// makes the broadcast once per request id; the worker sends each recipient through the one-person template path, never twice,
// waits for the next morning at the day's cap, skips at the month's, pauses itself when WhatsApp refuses too many, and can be
// resumed or cancelled. No figure is a rupee.
import { randomUUID } from "node:crypto";
import { BROADCAST_PAUSE_MIN_SETTLED } from "@travel-crm/contracts/inbox";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BROADCAST_READY_EVENT,
  broadcastDetailOf,
  cancelBroadcast,
  createBroadcast,
  listBroadcasts,
  nextMorning,
  previewBroadcast,
  resumeBroadcast,
  sendBroadcastBatch,
  setConversationTags,
  createTag,
} from "../../src/inbox/index.js";
import { aLead, aPerson, freshPhone } from "../crm/support/records.js";
import { auditOf, eventsOf, memberOf } from "../imports/support/test-imports.js";
import { aConnectedAgency, createTestInbox, testNow, type TestInbox } from "./support.js";

const HOUR = 3_600_000;
const ZONE = "Asia/Kolkata";

describe("broadcasts", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency with an approved marketing template, a tag, and `granted` chats whose people agreed, plus one of each way to be left out. */
  async function agency(options: { granted?: number; marketingCap?: number; dayCap?: number } = {}) {
    const connection = await aConnectedAgency(test);
    const { organizationId } = connection;
    const admin = memberOf(organizationId, "org-admin");
    const inOrg = <T>(work: Parameters<typeof test.db.forOrg<T>>[1]) => test.db.forOrg(organizationId, work);
    const owner = randomUUID();
    const made = await inOrg(async (tx) => {
      await tx.whatsappConnection.update({
        where: { id: connection.connectionId },
        data: { marketingCapMonth: options.marketingCap ?? 300, templateCapDay: options.dayCap ?? 100 },
      });
      const template = await tx.whatsappTemplate.create({
        data: {
          connectionId: connection.connectionId,
          name: "goa_offer",
          language: "en",
          category: "marketing",
          body: "Hi {{1}}, Goa packages are on offer.",
          status: "approved",
        },
      });
      const tag = await createTag(tx, admin, { name: "Goa interested" });
      const chat = async (consent: "granted" | "withdrawn" | "none" | "noPerson") => {
        const person = consent === "noPerson" ? null : await aPerson(tx);
        if (person !== null) await aLead(tx, { personId: person.id, ownerUserId: owner });
        if (person !== null && consent !== "none") {
          await tx.personConsent.create({
            data: {
              personId: person.id,
              purpose: "whatsapp",
              action: consent,
              wording: "test",
              wordingVersion: 1,
              source: "staff",
              recordedAt: new Date(testNow.getTime() - 48 * HOUR),
            },
          });
        }
        const row = await tx.whatsappConversation.create({
          data: {
            connectionId: connection.connectionId,
            phoneE164: freshPhone(),
            personId: person?.id ?? null,
            lastMessageAt: testNow,
          },
        });
        await setConversationTags(tx, admin, { conversationId: row.id, tagIds: [tag.id] });
        return { id: row.id, personId: person?.id ?? null };
      };
      const granted = [];
      for (let index = 0; index < (options.granted ?? 3); index += 1) granted.push(await chat("granted"));
      const left = {
        optedOut: await chat("withdrawn"),
        noConsent: await chat("none"),
        noPerson: await chat("noPerson"),
      };
      return { template, tag, granted, left };
    });
    const input = { templateId: made.template.id, tagIds: [made.tag.id], params: ["there"] };
    const create = (requestId = randomUUID(), at = testNow) =>
      inOrg((tx) => createBroadcast(tx, admin, { requestId, ...input }, at));
    const context = { organizationId, forOrg: inOrg };
    const run = (id: string, at = testNow) => sendBroadcastBatch(context, id, ZONE, at);
    const detail = (id: string) => inOrg((tx) => broadcastDetailOf(tx, { broadcastId: id, limit: 100 }, testNow));
    const messages = () => inOrg((tx) => tx.whatsappMessage.findMany({ where: { broadcastId: { not: null } } }));
    return { connection, organizationId, admin, inOrg, owner, ...made, input, create, run, detail, messages };
  }

  it("previews who it reaches and who is left out, and why, and what is left of the allowance", async () => {
    const { inOrg, admin, input, owner, organizationId } = await agency({ marketingCap: 2 });
    const preview = await inOrg((tx) => previewBroadcast(tx, admin, input, testNow));
    expect(preview).toEqual({
      willSend: 2,
      leftOut: { optedOut: 1, noConsent: 2, outsideVisibility: 0, overAllowance: 1 },
      allowance: { limit: 2, used: 0, remaining: 2 },
      today: { sendToday: 2, waitForTomorrow: 0 },
    });
    // A salesperson who owns none of those leads sees none of the chats.
    const stranger = memberOf(organizationId, "sales");
    const seen = await inOrg((tx) => previewBroadcast(tx, stranger, input, testNow));
    expect(seen.willSend).toBe(0);
    expect(seen.leftOut.outsideVisibility).toBe(6);
    expect(owner).toBeTruthy();
  });

  it("makes the broadcast once however often the same request arrives, with a row for each recipient and one event", async () => {
    const { create, inOrg, organizationId, detail } = await agency();
    const requestId = randomUUID();
    const [first, again] = [await create(requestId), await create(requestId)];
    expect(again.id).toBe(first.id);
    expect((await detail(first.id)).broadcast.counts).toMatchObject({ total: 3, waiting: 3 });
    expect(await inOrg((tx) => tx.whatsappBroadcast.count())).toBe(1);
    expect(await eventsOf(test, organizationId, [BROADCAST_READY_EVENT])).toHaveLength(1);
    expect((await inOrg((tx) => listBroadcasts(tx))).items.map((item) => item.id)).toEqual([first.id]);
  });

  it("refuses a broadcast no chat would receive", async () => {
    const { admin, inOrg, template } = await agency({ granted: 0 });
    const noOne = await inOrg(async (tx) => createTag(tx, admin, { name: "Nobody" }));
    await expect(
      inOrg((tx) =>
        createBroadcast(
          tx,
          admin,
          { requestId: randomUUID(), templateId: template.id, tagIds: [noOne.id], params: ["x"] },
          testNow,
        ),
      ),
    ).rejects.toMatchObject({ reason: "BROADCAST_NO_RECIPIENTS" });
  });

  it("sends each recipient once through the template path, even when runs overlap", async () => {
    const { create, run, messages, detail } = await agency();
    const { id } = await create();
    await Promise.all([run(id), run(id), run(id)]);
    await run(id);
    const sent = await messages();
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((message) => message.conversationId)).size).toBe(3);
    expect(sent.every((message) => message.kind === "template" && message.status === "queued")).toBe(true);
    const done = await detail(id);
    expect(done.broadcast).toMatchObject({ status: "done", counts: { total: 3, sent: 3, waiting: 0 } });
  });

  it("holds what is over today's template cap until the next morning at ten, then sends it", async () => {
    const { create, run, detail } = await agency({ dayCap: 2 });
    const { id } = await create();
    await run(id);
    let state = await detail(id);
    expect(state.broadcast).toMatchObject({ status: "sending", counts: { sent: 2, waiting: 1 } });
    const morning = nextMorning(testNow, ZONE);
    expect(state.recipients.find((recipient) => recipient.state === "waiting")?.notBefore).toBe(morning.toISOString());
    await run(id, new Date(testNow.getTime() + 2 * HOUR));
    expect((await detail(id)).broadcast.counts.waiting).toBe(1);
    await run(id, new Date(morning.getTime() + 1_000));
    state = await detail(id);
    expect(state.broadcast).toMatchObject({ status: "done", counts: { sent: 3, waiting: 0 } });
  });

  it("skips what is over the month's allowance, with that reason", async () => {
    const { create, run, detail, inOrg, connection } = await agency({ marketingCap: 3 });
    const { id } = await create();
    await inOrg((tx) =>
      tx.whatsappUsageMonth.create({
        data: { connectionId: connection.connectionId, month: new Date("2026-10-01T00:00:00Z"), marketing: 3 },
      }),
    );
    await run(id);
    const state = await detail(id);
    expect(state.broadcast.counts).toMatchObject({ skipped: 3, sent: 0 });
    expect(new Set(state.recipients.map((recipient) => recipient.reason))).toEqual(new Set(["monthly_cap"]));
  });

  it("skips someone who asked to stop between confirming and sending", async () => {
    const { create, run, detail, inOrg, granted } = await agency();
    const { id } = await create();
    await inOrg((tx) =>
      tx.personConsent.create({
        data: {
          personId: granted[0]?.personId ?? "",
          purpose: "whatsapp",
          action: "withdrawn",
          wording: "stop",
          wordingVersion: 1,
          source: "customer",
          recordedAt: new Date(testNow.getTime() - HOUR),
        },
      }),
    );
    await run(id);
    const state = await detail(id);
    expect(state.broadcast.counts).toMatchObject({ sent: 2, skipped: 1 });
    expect(state.recipients.find((recipient) => recipient.state === "skipped")?.reason).toBe("opted_out");
  });

  it("pauses itself when WhatsApp refuses too many, says why, and can be resumed or cancelled", async () => {
    const { create, run, detail, inOrg, admin, organizationId, messages } = await agency({ granted: 30 });
    const { id } = await create();
    // The first batch goes; WhatsApp then refuses them all.
    await run(id);
    const first = await messages();
    expect(first.length).toBeGreaterThanOrEqual(BROADCAST_PAUSE_MIN_SETTLED);
    await inOrg((tx) =>
      tx.whatsappMessage.updateMany({
        where: { broadcastId: id },
        data: { status: "failed", failureCode: "other" },
      }),
    );
    await run(id, new Date(testNow.getTime() + 60_000));
    const paused = await detail(id);
    expect(paused.broadcast).toMatchObject({ status: "paused", pausedReason: "failure_rate" });
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { link: { contains: id } } }));
    expect(notices).toHaveLength(1);
    expect((await auditOf(test, organizationId, id)).map((entry) => entry.action)).toContain("inbox.broadcast-paused");
    const waitingBefore = paused.broadcast.counts.waiting;
    expect(waitingBefore).toBeGreaterThan(0);

    // Nothing goes while paused; resuming lets the rest go, and the old refusals do not stop it again.
    await run(id, new Date(testNow.getTime() + 2 * 60_000));
    expect((await detail(id)).broadcast.counts.waiting).toBe(waitingBefore);
    await inOrg((tx) => resumeBroadcast(tx, admin, { broadcastId: id }));
    await run(id, new Date(testNow.getTime() + 3 * 60_000));
    expect((await detail(id)).broadcast.status).toBe("done");

    // A second broadcast, cancelled: what waited is skipped as cancelled.
    const other = await agency({ granted: 4, dayCap: 1 });
    const again = await other.create();
    await other.run(again.id);
    await other.inOrg((tx) => cancelBroadcast(tx, other.admin, { broadcastId: again.id }, testNow));
    const cancelled = await other.detail(again.id);
    expect(cancelled.broadcast).toMatchObject({ status: "cancelled", counts: { sent: 1, skipped: 3, waiting: 0 } });
    expect(new Set(cancelled.recipients.filter((r) => r.state === "skipped").map((r) => r.reason))).toEqual(
      new Set(["cancelled"]),
    );
  });

  it("lets only its creator or someone who writes templates stop it", async () => {
    const { create, inOrg, organizationId } = await agency();
    const { id } = await create();
    const stranger = memberOf(organizationId, "sales");
    await expect(inOrg((tx) => cancelBroadcast(tx, stranger, { broadcastId: id }, testNow))).rejects.toMatchObject({
      reason: "MISSING_PERMISSION",
    });
    const another = memberOf(organizationId, "org-admin");
    await inOrg((tx) => cancelBroadcast(tx, another, { broadcastId: id }, testNow));
    expect((await inOrg((tx) => tx.whatsappBroadcast.findUniqueOrThrow({ where: { id } }))).status).toBe("cancelled");
  });
});
