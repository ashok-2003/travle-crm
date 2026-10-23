// The webhook's work for a lead (M7-M11): the lead is fetched with the Page's token and saved by the one save path, keyed on
// the Meta lead id, so a delivery three times is one lead; two lead ids for one phone are a lead and a repeat enquiry; a
// returning customer is marked; a `p:` phone and a custom question are read; a lead that cannot be added is written down;
// a form not brought in is skipped and told once; a failing token moves the Page to needs_reconnect; a transient failure
// is retried; and no token is in an error or a log.
import { afterAll, describe, expect, it } from "vitest";
import { catchUpPage, retryMetaLead } from "../../src/crm/index.js";
import { freshPhone, aLead, aPerson } from "../crm/support/records.js";
import { storedMessageOf } from "./support/errors.js";
import { createTestMeta, eventsOf } from "./support/meta.js";
import { aRunningPage, now } from "./support/running.js";

const test = createTestMeta();
afterAll(() => test.close());

const answers = (name: string, phone: string, extra: Record<string, string[]> = {}) => ({
  full_name: [name],
  phone_number: [phone],
  email: [`${name.toLowerCase().replaceAll(" ", ".")}@example.test`],
  ...extra,
});

const ledgerOf = (running: Awaited<ReturnType<typeof aRunningPage>>, metaLeadId: string) =>
  running.inOrg((tx) => tx.metaLead.findFirst({ where: { metaLeadId } }));
const notificationsOf = (running: Awaited<ReturnType<typeof aRunningPage>>, kind: string) =>
  running.inOrg((tx) => tx.notification.findMany({ where: { kind } }));

describe("a lead from the webhook", () => {
  it("is saved with its source, detail, note and owner, and the ledger and counters say so", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("L1", answers("Asha Rao", freshPhone(), { where_to: ["Spiti"] }), { platform: "instagram" });
    expect(await running.deliver("L1")).toBe("added");
    const [lead] = await running.leads();
    expect(lead).toMatchObject({
      source: "meta_lead_ad",
      sourceDetail: "Winter ad · Instagram",
      ownerUserId: running.owner,
      returning: false,
    });
    expect(lead?.createdAt).toEqual(new Date(now.getTime() - 60_000));
    expect(await ledgerOf(running, "L1")).toMatchObject({
      status: "added",
      platform: "instagram",
      leadId: lead?.id,
      personId: lead?.personId,
    });
    expect(
      await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } })),
    ).toMatchObject({ leadsAdded: 1 });
    // The owner who is the actor's fallback is told as every new lead tells its owner.
    const audit = await running.inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: lead?.id ?? "" } }));
    expect(audit[0]?.after).toMatchObject({ metaLeadId: "L1" });
  });

  it("reads a destination question into the lead's trip", async () => {
    const running = await aRunningPage(test, { form: { fields: { where_to: "destination" } } });
    running.leadAtMeta("L2", answers("Neha Joshi", freshPhone(), { where_to: ["Spiti Valley"] }));
    await running.deliver("L2");
    const lead = await running.inOrg((tx) => tx.lead.findFirstOrThrow({ include: { destination: true } }));
    expect(lead.destination?.name).toBe("Spiti Valley");
  });

  it("puts a question matched to the note in the lead's note, under the question", async () => {
    const running = await aRunningPage(test, {
      form: {
        questions: [
          { key: "full_name", type: "full_name", label: "Full name" },
          { key: "phone_number", type: "phone", label: "Phone" },
          { key: "trip_wish", type: "custom", label: "What should we plan?" },
          { key: "city", type: "city", label: "City" },
        ],
      },
    });
    running.leadAtMeta("L2B", {
      full_name: ["Neha Joshi"],
      phone_number: [freshPhone()],
      trip_wish: ["A quiet week"],
      city: ["Jaipur"],
    });
    await running.deliver("L2B");
    expect((await running.leads())[0]?.note).toBe("What should we plan?: A quiet week\nFrom: Jaipur");
  });

  it("makes one lead however often a delivery repeats, and counts the repeats as duplicates", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("L3", answers("Ravi Kumar", freshPhone()));
    expect(await running.deliver("L3")).toBe("added");
    expect(await running.deliver("L3")).toBe("settled");
    expect(await running.deliver("L3")).toBe("settled");
    expect(await running.leads()).toHaveLength(1);
    expect(
      await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } })),
    ).toMatchObject({ leadsAdded: 1, leadsDuplicate: 2 });
  });

  it("makes a lead and then a repeat enquiry for two Meta lead ids with one phone", async () => {
    const running = await aRunningPage(test);
    const phone = freshPhone();
    running.leadAtMeta("A", answers("Kavya Menon", phone));
    running.leadAtMeta("B", answers("Kavya Menon", phone, { where_to: ["Goa"] }));
    expect(await running.deliver("A")).toBe("added");
    expect(await running.deliver("B")).toBe("merged");
    expect(await running.leads()).toHaveLength(1);
    expect(await running.inOrg((tx) => tx.leadEnquiry.count())).toBe(1);
    expect(await ledgerOf(running, "B")).toMatchObject({ status: "merged" });
    expect(
      await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } })),
    ).toMatchObject({ leadsAdded: 1, leadsMerged: 1 });
  });

  it("marks a person with only closed leads as returning", async () => {
    const running = await aRunningPage(test);
    const phone = freshPhone();
    await running.inOrg(async (tx) => {
      const person = await aPerson(tx, { name: "Sneha Patel", phoneE164: phone });
      await aLead(tx, { personId: person.id, stage: "won" });
    });
    running.leadAtMeta("R1", answers("Sneha Patel", phone));
    expect(await running.deliver("R1")).toBe("added");
    const leads = await running.leads();
    expect(leads).toHaveLength(2);
    expect(leads.filter((lead) => lead.returning)).toHaveLength(1);
  });

  it("reads Meta's p: prefix and a number without a country code", async () => {
    const running = await aRunningPage(test);
    const national = freshPhone().replace("+91", "");
    running.leadAtMeta("P1", answers("Prefixed Person", `p:+91${national}`));
    running.leadAtMeta("P2", answers("Plain Person", national));
    expect(await running.deliver("P1")).toBe("added");
    expect(await running.deliver("P2")).toBe("merged");
    const people = await running.inOrg((tx) => tx.person.findMany({ select: { phoneE164: true } }));
    expect(people.map((person) => person.phoneE164)).toEqual([`+91${national}`]);
  });

  it("writes down a lead whose phone is no number and who has no other contact, as a problem with a short example", async () => {
    const running = await aRunningPage(test, {
      form: {
        questions: [
          { key: "full_name", type: "full_name", label: "Name" },
          { key: "phone_number", type: "phone", label: "Phone" },
        ],
      },
    });
    running.leadAtMeta("BAD", { full_name: ["Asha Rao"], phone_number: ["call me"] });
    expect(await running.deliver("BAD")).toBe("not_added");
    expect(await running.leads()).toHaveLength(0);
    expect(await ledgerOf(running, "BAD")).toMatchObject({
      status: "not_added",
      reasons: ["phone_invalid"],
      exampleName: "Asha Rao",
    });
  });

  it("keeps a phone that is no number in the note when the lead has an email", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("EM", answers("Email Person", "not a number"));
    expect(await running.deliver("EM")).toBe("added");
    expect((await running.leads())[0]?.note).toContain("not a number");
  });

  it("does not add a lead with a blocked contact", async () => {
    const running = await aRunningPage(test);
    const phone = freshPhone();
    await running.inOrg((tx) => tx.blockedContact.create({ data: { kind: "phone", value: phone } }));
    running.leadAtMeta("BL", answers("Quick Loans", phone));
    expect(await running.deliver("BL")).toBe("not_added");
    expect(await ledgerOf(running, "BL")).toMatchObject({ status: "not_added", reasons: ["blocked"] });
  });
});

describe("a form that was not brought in", () => {
  it("is skipped, counted, told to the Owner once, and its lead is caught up when the form is brought in", async () => {
    const running = await aRunningPage(test, { form: { state: "not_brought_in" } });
    running.leadAtMeta("N1", answers("First Person", freshPhone()));
    running.leadAtMeta("N2", answers("Second Person", freshPhone()));
    expect(await running.deliver("N1")).toBe("form_not_brought_in");
    expect(await running.deliver("N2")).toBe("form_not_brought_in");
    expect(await running.leads()).toHaveLength(0);
    expect(await ledgerOf(running, "N1")).toBeNull();
    const form = await running.inOrg((tx) => tx.metaForm.findUniqueOrThrow({ where: { id: running.form.id } }));
    expect(form).toMatchObject({ skippedLeads: 2, state: "not_brought_in" });
    const notices = await notificationsOf(running, "meta.new-form");
    expect(notices).toHaveLength(1);
    expect(notices[0]?.title).toContain("Winter ad");
    expect(notices[0]?.recipientUserId).toBe(running.owner);
    // Bringing it in matches its questions, and the catch-up then takes the skipped leads in.
    await running.inOrg(async (tx) => {
      await tx.metaFormQuestion.createMany({
        data: [
          {
            formRowId: running.form.id,
            questionKey: "full_name",
            questionType: "full_name",
            label: "Full name",
            field: "name",
          },
          {
            formRowId: running.form.id,
            questionKey: "phone_number",
            questionType: "phone",
            label: "Phone",
            field: "phone",
          },
          { formRowId: running.form.id, questionKey: "email", questionType: "email", label: "Email", field: "email" },
        ],
      });
      await tx.metaForm.update({ where: { id: running.form.id }, data: { state: "running" } });
    });
    const result = await catchUpPage(running.dependencies, running.agency, running.page.metaPageId, now);
    expect(result.added).toBe(2);
    expect(await running.leads()).toHaveLength(2);
  });

  it("makes the row of a form never seen, with its name from Meta, and tells once for it", async () => {
    const running = await aRunningPage(test);
    test.graph.addForm(running.page.metaPageId, { id: "BRAND-NEW", name: "Diwali offers", questions: [] });
    for (let n = 0; n < 2; n += 1) {
      expect(await running.deliver(`D${String(n)}`, "BRAND-NEW")).toBe("form_not_brought_in");
    }
    const form = await running.inOrg((tx) => tx.metaForm.findFirstOrThrow({ where: { formId: "BRAND-NEW" } }));
    expect(form).toMatchObject({ formName: "Diwali offers", skippedLeads: 2, state: "not_brought_in" });
    expect((await notificationsOf(running, "meta.new-form")).map((notice) => notice.title)).toEqual([
      "A lead came from 'Diwali offers', a form you haven't brought in",
    ]);
  });
});

describe("a Page that cannot be read", () => {
  it("ignores a paused Page and one that needs a reconnect, saving nothing", async () => {
    for (const status of ["paused", "needs_reconnect"]) {
      const running = await aRunningPage(test, { page: { status } });
      running.leadAtMeta("X", answers("Ignored Person", freshPhone()));
      expect(await running.deliver("X"), status).toBe("page_inactive");
      expect(await ledgerOf(running, "X")).toBeNull();
    }
  });

  it("moves the Page to needs_reconnect when the token fails, tells the Owner once, and keeps the lead pending for the catch-up", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("T1", answers("Token Person", freshPhone()));
    test.graph.expireToken(running.page.token);
    expect(await running.deliver("T1")).toBe("needs_reconnect");
    expect(await running.deliver("T1")).toBe("page_inactive");
    expect(
      (await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } }))).status,
    ).toBe("needs_reconnect");
    expect((await eventsOf(test, running.agency, ["meta.attention"])).length).toBe(1);
    expect(await ledgerOf(running, "T1")).toMatchObject({ status: "pending" });
    expect(await running.leads()).toHaveLength(0);
  });

  it("fails the attempt on a transient failure, so the worker retries, and never puts a token in the error or the log", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("TR", answers("Retry Person", freshPhone()));
    test.graph.throwNext(new Error(`GET https://graph.facebook.com/TR?access_token=${running.page.token} timed out`));
    const failure = await running.deliver("TR").then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain(running.page.token);
    expect(storedMessageOf(failure)).toContain("Meta lead fetch failed: unavailable");
    expect(storedMessageOf(failure)).not.toContain(running.page.token);
    expect(JSON.stringify(test.logger.entries)).not.toContain(running.page.token);
    expect(await ledgerOf(running, "TR")).toMatchObject({ status: "pending" });
    // The retry finds the lead and saves it.
    expect(await running.deliver("TR")).toBe("added");
  });

  it("treats Meta's rate limit as a retry, not as a failure of the Page", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("RL", answers("Limited Person", freshPhone()));
    test.graph.failNext("rate_limited", { pageId: running.page.metaPageId, code: 80005 });
    await expect(running.deliver("RL")).rejects.toThrow("rate_limited");
    expect(
      (await running.inOrg((tx) => tx.metaPage.findUniqueOrThrow({ where: { id: running.page.id } }))).status,
    ).toBe("running");
    expect(await running.deliver("RL")).toBe("added");
  });

  it("writes down a lead Meta says is gone, and one it will not show, without retrying", async () => {
    const running = await aRunningPage(test);
    expect(await running.deliver("NEVER-EXISTED")).toBe("lead_gone");
    expect(await ledgerOf(running, "NEVER-EXISTED")).toMatchObject({
      status: "not_added",
      reasons: ["lead_not_found"],
    });
    running.leadAtMeta("NOPE", answers("Forbidden Person", freshPhone()));
    test.graph.failNext("permission", { pageId: running.page.metaPageId, code: 10 });
    expect(await running.deliver("NOPE")).toBe("lead_gone");
    expect(await ledgerOf(running, "NOPE")).toMatchObject({ status: "not_added", reasons: ["lead_not_allowed"] });
  });

  it("stops at the organization's Graph budget, as a retry, and leaves the lead pending", async () => {
    const running = await aRunningPage(test, { budget: { perHour: 2, catchupPerHour: 1 } });
    for (const id of ["B1", "B2", "B3"]) running.leadAtMeta(id, answers(`Budget ${id}`, freshPhone()));
    expect(await running.deliver("B1")).toBe("added");
    expect(await running.deliver("B2")).toBe("added");
    await expect(running.deliver("B3")).rejects.toThrow("budget");
    expect(await ledgerOf(running, "B3")).toMatchObject({ status: "pending" });
    // Another agency has its own budget.
    const other = await aRunningPage(test, { budget: { perHour: 2, catchupPerHour: 1 } });
    other.leadAtMeta("B1", answers("Other Budget", freshPhone()));
    expect(await other.deliver("B1")).toBe("added");
  });
});

describe("an agency that cannot change things", () => {
  it("accepts the delivery and saves nothing, leaving the lead for the catch-up when access returns", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("RO", answers("Read Only", freshPhone()));
    running.setAccess("read_only");
    expect(await running.deliver("RO")).toBe("closed");
    expect(await ledgerOf(running, "RO")).toBeNull();
    running.setAccess("full");
    const result = await catchUpPage(running.dependencies, running.agency, running.page.metaPageId, now);
    expect(result.added).toBe(1);
  });
});

describe("Check again on a problem", () => {
  it("reads the lead from Meta once more and adds it when the problem is gone", async () => {
    const running = await aRunningPage(test);
    const phone = freshPhone();
    running.leadAtMeta("RT", { full_name: ["Retry Person"], phone_number: ["not a number"] });
    expect(await running.deliver("RT")).toBe("not_added");
    const row = await ledgerOf(running, "RT");
    // Meta now shows the number the person corrected in their form.
    test.graph.addLead({
      id: "RT",
      formId: running.form.formId,
      answers: { full_name: ["Retry Person"], phone_number: [phone] },
    });
    const result = await retryMetaLead(
      running.dependencies,
      running.member,
      { pageId: running.page.id, leadRowId: row?.id ?? "" },
      now,
    );
    expect(result).toBe("added");
    expect(await ledgerOf(running, "RT")).toMatchObject({ status: "added", exampleName: null, reasons: [] });
    expect(await running.leads()).toHaveLength(1);
  });

  it("is refused for a lead that is not a problem or belongs to another Page, and when Meta no longer has it", async () => {
    const running = await aRunningPage(test);
    running.leadAtMeta("OK1", answers("Fine Person", freshPhone()));
    await running.deliver("OK1");
    const ok = await ledgerOf(running, "OK1");
    await expect(
      retryMetaLead(running.dependencies, running.member, { pageId: running.page.id, leadRowId: ok?.id ?? "" }, now),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
    const other = await aRunningPage(test);
    other.leadAtMeta("OT", { full_name: ["Other"], phone_number: ["nope"] });
    await other.deliver("OT");
    const theirs = await ledgerOf(other, "OT");
    await expect(
      retryMetaLead(
        running.dependencies,
        running.member,
        { pageId: running.page.id, leadRowId: theirs?.id ?? "" },
        now,
      ),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
    await expect(
      retryMetaLead(other.dependencies, other.member, { pageId: other.page.id, leadRowId: theirs?.id ?? "" }, now),
    ).resolves.toBeDefined();
    test.graph.deleteLead("OT");
  });
});
