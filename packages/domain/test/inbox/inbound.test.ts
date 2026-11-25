// A customer's WhatsApp message (I1-I7): stored first, once however often it is delivered, a lead for a number we don't know
// (one lead for a burst), nothing new for a person with an open lead, a button for a past customer, a blocked contact kept
// hidden, a number nobody recorded counted and ignored, a number being set up only stamped, and a read-only agency's
// messages kept until access returns.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openLeadForChat } from "../../src/ai/lite/open-lead.js";
import { addBlockedContact, QUIET_HOURS } from "../../src/crm/index.js";
import {
  adoptAll,
  adoptChats,
  noteUnrouted,
  routeOfNumber,
  startLeadFromConversation,
  unroutedNumbers,
} from "../../src/inbox/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { aLead, aPerson } from "../crm/support/records.js";
import { memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  aSecondNumber,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  signer,
  testNow,
  type TestInbox,
} from "./support.js";

describe("an inbound WhatsApp message", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  const digits = (phone: string) => phone.replace("+", "");

  it("makes a lead, a chat and a message from a number we don't know, and counts it", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    const organizationId = await deliver(
      test,
      fromCustomer(connection, {
        customerNumber: digits(phone),
        customerName: "Priya",
        text: "Goa in December?",
        ts: 1792749600,
      }),
    );
    expect(organizationId).toBe(connection.organizationId);
    const { lead, chat, messages, usage, row } = await test.db.forOrg(connection.organizationId, async (tx) => ({
      lead: await tx.lead.findFirstOrThrow({ include: { person: true } }),
      chat: await tx.whatsappConversation.findFirstOrThrow(),
      messages: await tx.whatsappMessage.findMany(),
      usage: await tx.whatsappUsageMonth.findFirstOrThrow(),
      row: await tx.whatsappConnection.findFirstOrThrow(),
    }));
    expect(lead).toMatchObject({ source: "whatsapp", stage: "new" });
    expect(lead.person).toMatchObject({ name: "Priya", phoneE164: phone });
    expect(chat).toMatchObject({
      phoneE164: phone,
      personId: lead.personId,
      needsReply: true,
      hidden: false,
      profileName: "Priya",
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "in",
      origin: "customer",
      kind: "text",
      body: "Goa in December?",
      status: "received",
      mediaState: "none",
    });
    expect(chat.lastInboundAt).toEqual(new Date(1792749600 * 1000));
    expect(usage.inbound).toBe(1);
    expect(row.lastEventAt).toEqual(testNow);
  });

  it("stores the same delivery once however often it comes", async () => {
    const connection = await aConnectedAgency(test);
    const body = fromCustomer(connection, { customerNumber: digits(freshPhone()), text: "Hello" });
    await deliver(test, body);
    await deliver(test, body);
    await deliver(test, [body, body]);
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.count())).toBe(1);
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.lead.count())).toBe(1);
  });

  it("makes one lead and one chat from three quick messages from a new number", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    await Promise.all(
      ["one", "two", "three"].map((text) => deliver(test, fromCustomer(connection, { customerNumber, text }))),
    );
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.lead.count())).toBe(1);
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappConversation.count())).toBe(1);
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.count())).toBe(3);
  });

  it("adds no lead and no repeat enquiry for a person with an open lead, and tells the owner once per burst", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    const lead = await test.db.forOrg(connection.organizationId, async (tx) =>
      aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id, ownerUserId: crypto.randomUUID() }),
    );
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Any update?" }));
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Hello?" }));
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      leads: await tx.lead.count(),
      enquiries: await tx.leadEnquiry.count(),
      restarts: await tx.leadTimelineEntry.count({ where: { leadId: lead.id, kind: "whatsapp-contact" } }),
      events: await tx.outboxEvent.count({ where: { type: "whatsapp.message-received" } }),
      chat: await tx.whatsappConversation.findFirstOrThrow(),
    }));
    expect(state).toMatchObject({ leads: 1, enquiries: 0, restarts: 1, events: 1 });
    expect(state.chat.personId).toBe(lead.personId);
    expect(QUIET_HOURS).toBe(24);
  });

  it("leaves a past customer's chat waiting for the Start a new lead button", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    await test.db.forOrg(connection.organizationId, async (tx) =>
      aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id, stage: "won" }),
    );
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Thanks!" }));
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      leads: await tx.lead.count(),
      chat: await tx.whatsappConversation.findFirstOrThrow(),
      events: await tx.outboxEvent.count({ where: { type: "whatsapp.past-customer-wrote" } }),
    }));
    expect(state.leads).toBe(1);
    expect(state.chat).toMatchObject({ hidden: false, needsReply: true });
    expect(state.chat.personId).not.toBeNull();
    expect(state.events).toBe(1);
  });

  it("stores a blocked contact's message with the chat hidden and does nothing else", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    await test.db.forOrg(connection.organizationId, (tx) =>
      addBlockedContact(tx, systemActor(connection.organizationId), { kind: "phone", value: phone }),
    );
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Offer for you" }));
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      leads: await tx.lead.count(),
      people: await tx.person.count(),
      chat: await tx.whatsappConversation.findFirstOrThrow(),
      messages: await tx.whatsappMessage.count(),
    }));
    expect(state).toMatchObject({ leads: 0, people: 0, messages: 1 });
    expect(state.chat.hidden).toBe(true);
  });

  it("counts a number nobody recorded and does nothing else", async () => {
    const stranger = aBusinessNumberFor();
    const organization = await deliver(test, {
      customerNumber: digits(freshPhone()),
      integratedNumber: stranger,
      uuid: "wamid.x1",
      direction: "0",
      contentType: "text",
      text: "hi",
    });
    expect(organization).toBeNull();
    await noteUnrouted(test.dependencies.db, stranger, testNow);
    const noted = (await unroutedNumbers(test.dependencies.db)).find((row) => row.integratedNumber === stranger);
    expect(noted?.events).toBe(2);
    // No route was made for it (other tests make routes of their own, at the same time, so the count is not looked at).
    expect(await routeOfNumber(test.dependencies.db, stranger)).toBeNull();
  });

  it("only stamps a number that is being set up", async () => {
    const connection = await aConnectedAgency(test, { status: "setup" });
    await deliver(test, fromCustomer(connection, { customerNumber: digits(freshPhone()), text: "test message" }));
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      messages: await tx.whatsappMessage.count(),
      leads: await tx.lead.count(),
      row: await tx.whatsappConnection.findFirstOrThrow(),
    }));
    expect(state).toMatchObject({ messages: 0, leads: 0 });
    expect(state.row.lastEventAt).toEqual(testNow);
  });

  it("keeps messages of a read-only agency without a lead, and makes the lead when access returns", async () => {
    const connection = await aConnectedAgency(test);
    const phone = freshPhone();
    test.setAccess("read_only");
    await deliver(test, fromCustomer(connection, { customerNumber: digits(phone), text: "Kerala trip?" }));
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.lead.count())).toBe(0);
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.count())).toBe(1);
    test.setAccess("full");
    expect(await adoptChats(test.dependencies, connection.organizationId, testNow)).toBe(1);
    const state = await test.db.forOrg(connection.organizationId, async (tx) => ({
      lead: await tx.lead.findFirstOrThrow(),
      chat: await tx.whatsappConversation.findFirstOrThrow(),
    }));
    expect(state.chat.personId).toBe(state.lead.personId);
    expect(await adoptChats(test.dependencies, connection.organizationId, testNow)).toBe(0);
  });

  it("makes nothing from a paused number but keeps the message", async () => {
    const connection = await aConnectedAgency(test, { status: "paused" });
    await deliver(test, fromCustomer(connection, { customerNumber: digits(freshPhone()), text: "hello" }));
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.lead.count())).toBe(0);
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.count())).toBe(1);
  });

  it("queues a copy of a photo and shows a reaction on its message", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const photo = fromCustomer(connection, {
      customerNumber,
      contentType: "image",
      caption: "Passport",
      url: "https://media.example/p1",
    });
    await deliver(test, photo);
    const message = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.findFirstOrThrow({ where: { kind: "image" } }),
    );
    expect(message).toMatchObject({ mediaState: "pending", mediaUrl: "https://media.example/p1", caption: "Passport" });
    expect(test.queue.sent.some((job) => job.queue === "whatsapp.copy-media" && job.id === message.id)).toBe(true);
    await deliver(
      test,
      fromCustomer(connection, {
        customerNumber,
        contentType: "reaction",
        text: "👍",
        replyMsgId: photo.uuid as string,
      }),
    );
    expect(
      (
        await test.db.forOrg(connection.organizationId, (tx) =>
          tx.whatsappMessage.findUniqueOrThrow({ where: { id: message.id } }),
        )
      ).reaction,
    ).toBe("👍");
    expect(await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.count())).toBe(1);
  });

  it("cuts text at WhatsApp's ceiling with a marker, never an error", async () => {
    const connection = await aConnectedAgency(test);
    await deliver(test, fromCustomer(connection, { customerNumber: digits(freshPhone()), text: "x".repeat(5000) }));
    const body =
      (await test.db.forOrg(connection.organizationId, (tx) => tx.whatsappMessage.findFirstOrThrow())).body ?? "";
    expect(body).toHaveLength(4096);
    expect(body.endsWith("…")).toBe(true);
  });

  it("tells the signer's path and header from the settings", () => {
    expect(signer.path).toBe(`/webhooks/msg91-whatsapp/${"t".repeat(40)}`);
  });

  it("keeps a reply button's and a list row's id on the customer's message, and a quick reply's only as words", async () => {
    const connection = await aConnectedAgency(test);
    const customerNumber = digits(freshPhone());
    const tap = (wamid: string, interactive: object) => ({
      ...fromCustomer(connection, { customerNumber, wamid, contentType: "interactive" }),
      interactive,
    });
    const id = "book:0190f3a2-0000-7000-8000-000000000001";
    await deliver(test, tap("wamid.TAP1", { type: "button_reply", button_reply: { id, title: "Book these seats" } }));
    await deliver(test, tap("wamid.TAP2", { type: "button_reply", button_reply: { id } }));
    await deliver(test, {
      ...fromCustomer(connection, { customerNumber, wamid: "wamid.QR1", contentType: "button" }),
      button: { payload: id, text: "Book" },
    });
    const row = { id: "trips:destination-1", title: "Manali", description: "2 trips" };
    await deliver(test, tap("wamid.LIST1", { type: "list_reply", list_reply: row }));
    const rows = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappMessage.findMany({
        where: { wamid: { in: ["wamid.TAP1", "wamid.TAP2", "wamid.QR1", "wamid.LIST1"] } },
      }),
    );
    const byWamid = (wamid: string) => rows.find((one) => one.wamid === wamid);
    expect(byWamid("wamid.TAP1")).toMatchObject({ buttonReplyId: id, body: "Book these seats" });
    expect(byWamid("wamid.TAP2")).toMatchObject({ buttonReplyId: id, body: null });
    expect(byWamid("wamid.QR1")?.buttonReplyId).toBeNull();
    expect(byWamid("wamid.LIST1")).toMatchObject({ buttonReplyId: row.id, body: "Manali" });
  });

  describe("with two numbers", () => {
    /**
     * An agency with a second number, "Sales 2", whose rule gives its leads to the Owner; every other lead waits in
     * Unassigned (the turns, with nobody in the pool).
     */
    async function ruledBySecondNumber() {
      const first = await aConnectedAgency(test);
      const second = await aSecondNumber(test, first);
      const { organizationId } = first;
      const owner = (await test.dependencies.identity.firstOwner(organizationId)) ?? "";
      await test.db.forOrg(organizationId, async (tx) => {
        await tx.assignmentSettings.create({ data: { mode: "turns" } });
        await tx.assignmentRule.create({
          data: { position: 0, whatsappConnectionId: second.connectionId, assigneeUserId: owner },
        });
      });
      /** The owner of the newest lead of the person in the number's chat with the phone. */
      const leadOwnerOf = (connectionId: string, phoneE164: string) =>
        test.db.forOrg(organizationId, async (tx) => {
          const chat = await tx.whatsappConversation.findFirstOrThrow({ where: { connectionId, phoneE164 } });
          const lead = await tx.lead.findFirstOrThrow({
            where: { personId: chat.personId ?? "" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          return lead.ownerUserId;
        });
      return { first, second, organizationId, owner, leadOwnerOf };
    }

    it("assigns a first message by the rule for the number it came in on", async () => {
      const { first, second, owner, leadOwnerOf } = await ruledBySecondNumber();
      const [onFirst, onSecond] = [freshPhone(), freshPhone()];
      await deliver(test, fromCustomer(second, { customerNumber: digits(onSecond), text: "Goa in December?" }));
      await deliver(test, fromCustomer(first, { customerNumber: digits(onFirst), text: "Goa in December?" }));
      expect(await leadOwnerOf(second.connectionId, onSecond)).toBe(owner);
      expect(await leadOwnerOf(first.connectionId, onFirst)).toBeNull();
    });

    it("adopts the chats of every connected number, each by its number's rule", async () => {
      const { first, second, organizationId, owner, leadOwnerOf } = await ruledBySecondNumber();
      const [onFirst, onSecond] = [freshPhone(), freshPhone()];
      test.setAccess("read_only");
      try {
        await deliver(test, fromCustomer(second, { customerNumber: digits(onSecond), text: "Kerala trip?" }));
        await deliver(test, fromCustomer(first, { customerNumber: digits(onFirst), text: "Kerala trip?" }));
      } finally {
        test.setAccess("full");
      }
      expect(await test.db.forOrg(organizationId, (tx) => tx.lead.count())).toBe(0);
      expect(await adoptChats(test.dependencies, organizationId, testNow)).toBe(2);
      expect(await leadOwnerOf(second.connectionId, onSecond)).toBe(owner);
      expect(await leadOwnerOf(first.connectionId, onFirst)).toBeNull();
    });

    it("starts a new lead in a chat by that chat's number's rule", async () => {
      const { first, second, organizationId, owner } = await ruledBySecondNumber();
      const pastCustomerOn = (connectionId: string) =>
        test.db.forOrg(organizationId, async (tx) => {
          const phoneE164 = freshPhone();
          const person = await aPerson(tx, { phoneE164 });
          await aLead(tx, { personId: person.id, stage: "won" });
          return tx.whatsappConversation.create({
            data: { connectionId, phoneE164, personId: person.id },
            select: { id: true, personId: true, phoneE164: true },
          });
        });
      const newLeadOwnerOf = async (personId: string | null) =>
        (
          await test.db.forOrg(organizationId, (tx) =>
            tx.lead.findFirstOrThrow({ where: { personId: personId ?? "", stage: "new" } }),
          )
        ).ownerUserId;
      const staff = memberOf(organizationId, "org-owner");
      const context = { ownerUserId: owner, workers: new Set([owner]) };
      const onSecond = await pastCustomerOn(second.connectionId);
      const onFirst = await pastCustomerOn(first.connectionId);
      for (const chat of [onSecond, onFirst]) {
        await test.db.forOrg(organizationId, (tx) => startLeadFromConversation(tx, staff, chat.id, context, testNow));
      }
      expect(await newLeadOwnerOf(onSecond.personId)).toBe(owner);
      expect(await newLeadOwnerOf(onFirst.personId)).toBeNull();
      // The AI opening a past customer's lead in a Sales 2 chat follows the same rule.
      const byAi = await pastCustomerOn(second.connectionId);
      const identity = {
        ...test.dependencies.identity,
        memberContacts: () => Promise.resolve([]),
        membersHolding: () => Promise.resolve([]),
      };
      const deps = { db: test.db, identity, subscriptions: test.dependencies.subscriptions };
      expect(await openLeadForChat(deps, organizationId, byAi, testNow)).toBe("opened");
      expect(await newLeadOwnerOf(byAi.personId)).toBe(owner);
    });

    it("adopts an agency's chats once a pass, however many numbers it has", async () => {
      const { organizationId } = await ruledBySecondNumber();
      const asked: string[] = [];
      const counting = {
        ...test.dependencies,
        subscriptions: {
          entitlementsOf: (id: string) => {
            asked.push(id);
            return test.dependencies.subscriptions.entitlementsOf(id);
          },
        },
      };
      // Read-only, so the pass looks at every agency and changes none: other tests' agencies share the database.
      test.setAccess("read_only");
      try {
        await adoptAll(counting, testNow);
      } finally {
        test.setAccess("full");
      }
      expect(asked.filter((id) => id === organizationId)).toHaveLength(1);
    });
  });
});

const aBusinessNumberFor = () => `9177${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
