// Messages written now and sent later, and snoozed chats waking (sales inbox spec 6): a time past the chat's 24-hour window is
// refused when scheduling; at its time a message is sent once however many runs overlap; one that cannot be sent notifies
// and audits its writer; a waking chat reminds its snoozer once.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cancelScheduled,
  listScheduled,
  pauseNumber,
  runDueWorkFor,
  scheduleMessage,
  snoozeConversation,
  recordWhatsappOptOut,
} from "../../src/inbox/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { auditOf, memberOf } from "../imports/support/test-imports.js";
import {
  aConnectedAgency,
  createTestInbox,
  deliver,
  freshPhone,
  fromCustomer,
  testNow,
  type TestInbox,
} from "./support.js";

const HOUR = 3_600_000;
const at = (hours: number) => new Date(testNow.getTime() + hours * HOUR);

describe("messages sent later", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  /** An agency whose customer wrote at testNow, and a member who may reply. */
  async function chat() {
    const connection = await aConnectedAgency(test);
    await deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Goa?" }));
    const conversation = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow(),
    );
    const member = memberOf(connection.organizationId);
    const schedule = (body: string, when: Date, now = testNow) =>
      test.db.forOrg(connection.organizationId, (tx) =>
        scheduleMessage(tx, member, { conversationId: conversation.id, body, sendAt: when.toISOString() }, now),
      );
    const outgoing = () =>
      test.db.forOrg(connection.organizationId, (tx) =>
        tx.whatsappMessage.findMany({ where: { direction: "out" }, orderBy: { id: "asc" } }),
      );
    const run = (now: Date) => runDueWorkFor(test.dependencies, connection.organizationId, now);
    return { connection, conversation, member, schedule, outgoing, run };
  }

  it("takes a time inside the window and refuses one at or past its end, with a clear reason", async () => {
    const { schedule } = await chat();
    await expect(schedule("See you", at(5))).resolves.toMatchObject({ status: "pending" });
    await expect(schedule("Too late", at(24))).rejects.toMatchObject({ reason: "SCHEDULE_OUTSIDE_WINDOW" });
    await expect(schedule("Way too late", at(30))).rejects.toMatchObject({ reason: "SCHEDULE_OUTSIDE_WINDOW" });
  });

  it("refuses to schedule in a chat whose window has closed already", async () => {
    const { schedule } = await chat();
    await expect(schedule("Hello", at(27), at(26))).rejects.toMatchObject({ reason: "SCHEDULE_OUTSIDE_WINDOW" });
  });

  it("sends a message at its time as the writer's own, and once however many runs overlap", async () => {
    const { schedule, run, outgoing, member } = await chat();
    await schedule("Your quote is ready", at(2));
    expect(await run(at(1))).toBe(0);
    const results = await Promise.all([run(at(3)), run(at(3)), run(at(3))]);
    expect(results.reduce((sum, done) => sum + done, 0)).toBe(1);
    const sent = await outgoing();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ body: "Your quote is ready", origin: "staff_crm", sentBy: member.userId });
    expect(await run(at(4))).toBe(0);
  });

  it("does not send one that was cancelled", async () => {
    const { schedule, run, outgoing, connection, member } = await chat();
    const scheduled = await schedule("Never mind", at(2));
    await test.db.forOrg(connection.organizationId, (tx) => cancelScheduled(tx, member, scheduled.id));
    await run(at(3));
    expect(await outgoing()).toHaveLength(0);
  });

  it("tells its writer and audits when it cannot be sent at its time", async () => {
    const { schedule, run, outgoing, connection, member, conversation } = await chat();
    const scheduled = await schedule("Your quote is ready", at(2));
    await test.db.forOrg(connection.organizationId, (tx) =>
      pauseNumber(tx, systemActor(connection.organizationId), at(1)),
    );
    expect(await run(at(3))).toBe(1);
    expect(await outgoing()).toHaveLength(0);
    const [row] = await test.db.forOrg(connection.organizationId, (tx) => listScheduled(tx, member, conversation.id));
    expect(row).toMatchObject({ id: scheduled.id, status: "failed", failureCode: "paused" });
    const notices = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.notification.findMany({ where: { recipientUserId: member.userId } }),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "whatsapp.send-failed", link: `/inbox/${conversation.id}` });
    const entries = await auditOf(test, connection.organizationId, conversation.id);
    expect(entries.map((entry) => entry.action)).toContain("inbox.scheduled-failed");
    // A later run does not tell them again.
    await run(at(4));
    expect(
      await test.db.forOrg(connection.organizationId, (tx) =>
        tx.notification.count({ where: { recipientUserId: member.userId } }),
      ),
    ).toBe(1);
  });

  it("does not write to someone who asked to stop in the meantime", async () => {
    const { schedule, run, outgoing, connection, member, conversation } = await chat();
    await schedule("Your quote is ready", at(2));
    const person = await test.db.forOrg(connection.organizationId, (tx) => tx.person.findFirstOrThrow());
    await test.db.forOrg(connection.organizationId, (tx) =>
      recordWhatsappOptOut(tx, systemActor(connection.organizationId), { personId: person.id, now: at(1) }),
    );
    await run(at(3));
    expect(await outgoing()).toHaveLength(0);
    const [row] = await test.db.forOrg(connection.organizationId, (tx) => listScheduled(tx, member, conversation.id));
    expect(row).toMatchObject({ status: "failed", failureCode: "opted_out" });
  });
});

describe("snoozed chats waking", () => {
  let test: TestInbox;
  beforeAll(() => {
    test = createTestInbox();
  });
  afterAll(() => test.close());

  it("reminds whoever snoozed the chat once, however many runs, and clears the snooze", async () => {
    const connection = await aConnectedAgency(test);
    await deliver(test, fromCustomer(connection, { customerNumber: freshPhone().replace("+", ""), text: "Hi" }));
    const conversation = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.whatsappConversation.findFirstOrThrow(),
    );
    const member = memberOf(connection.organizationId);
    await test.db.forOrg(connection.organizationId, (tx) =>
      snoozeConversation(tx, member, conversation.id, at(5), testNow),
    );
    const run = (now: Date) => runDueWorkFor(test.dependencies, connection.organizationId, now);
    expect(await run(at(4))).toBe(0);
    await Promise.all([run(at(6)), run(at(6))]);
    await run(at(7));
    const notices = await test.db.forOrg(connection.organizationId, (tx) =>
      tx.notification.findMany({ where: { recipientUserId: member.userId, kind: "inbox.snooze-ended" } }),
    );
    expect(notices).toHaveLength(1);
    expect(
      await test.db.forOrg(connection.organizationId, (tx) =>
        tx.whatsappConversation.findUniqueOrThrow({ where: { id: conversation.id } }),
      ),
    ).toMatchObject({ snoozedUntil: null, snoozedBy: null });
  });
});
