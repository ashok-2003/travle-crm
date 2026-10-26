// Team notes in a chat (sales inbox spec 6, owner decision 4 of 2026-10-26): a note written in a chat is a note on the chat's
// lead, shown in the chat at its time, and a mention tells only a teammate who may see that lead.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listNotes, addNote, MENTION_KIND } from "../../src/inbox/index.js";
import { listLeadTimeline } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

describe("team notes in a chat", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency whose customer wrote (so the chat has a lead), and the owner of that lead. */
  async function chat() {
    const connection = await aConnectedAgency(test);
    await deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Goa?" }));
    const { conversation, lead } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      conversation: await tx.whatsappConversation.findFirstOrThrow(),
      lead: await tx.lead.findFirstOrThrow(),
    }));
    const owner = lead.ownerUserId;
    if (owner === null) throw new Error("The test agency gives its leads an owner");
    const writer = memberOf(connection.organizationId, "org-admin");
    const write = (body: string, mentions: MemberAccess[] = [], by: MemberAccess = writer) =>
      test.db.forOrg(connection.organizationId, (tx) =>
        addNote(
          tx,
          by,
          { conversationId: conversation.id, body, mentions: mentions.map((member) => member.userId) },
          new Map([...mentions, by].map((member) => [member.userId, member])),
          "Meera",
        ),
      );
    const noticesFor = (member: MemberAccess) =>
      test.db.forOrg(connection.organizationId, (tx) =>
        tx.notification.findMany({ where: { recipientUserId: member.userId, kind: MENTION_KIND } }),
      );
    return { connection, conversation, lead, owner, writer, write, noticesFor };
  }

  it("is a note on the chat's lead, on its timeline, listed in the chat with its writer and time", async () => {
    const { connection, conversation, lead, writer, write } = await chat();
    await write("Wants a Spiti trip in June, budget 80k");
    const { items, leadId } = await test.db.forOrg(connection.organizationId, (tx) =>
      listNotes(tx, writer, conversation.id),
    );
    expect(leadId).toBe(lead.id);
    // Only what a person wrote: the customer's first words, which crm keeps as a note, are in the chat as the message itself.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ body: "Wants a Spiti trip in June, budget 80k", createdBy: writer.userId });
    const notes = await test.db.forOrg(connection.organizationId, (tx) => tx.leadNote.findMany());
    expect(notes.map((note) => note.body)).toContain("Wants a Spiti trip in June, budget 80k");
    const timeline = await test.db.forOrg(connection.organizationId, (tx) =>
      listLeadTimeline(tx, writer, { leadId: lead.id, limit: 20 }),
    );
    expect(timeline.entries.some((entry) => entry.kind === "note")).toBe(true);
    const audit = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.auditEntry.findMany({ where: { entityId: lead.id, action: "lead.note-added" } }),
    );
    expect(audit).toHaveLength(1);
  });

  it("tells a mentioned teammate who may see the lead, and the chat is its link", async () => {
    const { conversation, owner, connection, write, noticesFor } = await chat();
    const seller = memberOf(connection.organizationId, "sales", { userId: owner });
    await write("@Asha please call back", [seller]);
    const notices = await noticesFor(seller);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ link: `/inbox/${conversation.id}` });
    expect(notices[0]?.body).not.toContain("call back");
  });

  it("tells nobody who may not see the lead: another salesperson's, or one without the inbox", async () => {
    const { connection, write, noticesFor } = await chat();
    const otherSeller = memberOf(connection.organizationId, "sales");
    const operations = memberOf(connection.organizationId, "operations");
    const admin = memberOf(connection.organizationId, "org-admin");
    await write("@all fyi", [otherSeller, operations, admin]);
    expect(await noticesFor(otherSeller)).toHaveLength(0);
    expect(await noticesFor(operations)).toHaveLength(0);
    expect(await noticesFor(admin)).toHaveLength(1);
  });

  it("refuses a mention of someone who is not in the agency", async () => {
    const { connection, conversation, writer } = await chat();
    await expect(
      test.db.forOrg(connection.organizationId, (tx) =>
        addNote(
          tx,
          writer,
          { conversationId: conversation.id, body: "hi", mentions: ["0199aaaa-0000-7000-8000-000000000000"] },
          new Map(),
          "Meera",
        ),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is refused for a chat that has no lead yet", async () => {
    const connection = await aConnectedAgency(test);
    const writer = memberOf(connection.organizationId);
    const conversationId = await test.db.forOrg(connection.organizationId, async (tx) => {
      const row = await tx.whatsappConversation.create({
        data: { connectionId: connection.connectionId, phoneE164: freshPhone(), lastInboundAt: testNow },
      });
      return row.id;
    });
    const { leadId } = await test.db.forOrg(connection.organizationId, (tx) => listNotes(tx, writer, conversationId));
    expect(leadId).toBeNull();
    await expect(
      test.db.forOrg(connection.organizationId, (tx) =>
        addNote(tx, writer, { conversationId, body: "hello", mentions: [] }, new Map(), "Meera"),
      ),
    ).rejects.toMatchObject({ reason: "CHAT_HAS_NO_LEAD" });
  });
});
