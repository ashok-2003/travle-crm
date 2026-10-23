// A Page's forms (spec 3.3, 3.4, 4.4): read from Meta and cached for five minutes, each known from first sight and not
// brought in; bringing one in stores the person's match and a cursor; Edit questions replaces the match and a form that
// gained a question shows it as new; a form with no name or no contact is refused.
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import {
  bringInForm,
  formQuestions,
  listForms,
  pageOf,
  refreshForms,
  saveQuestions,
  storedMatches,
} from "../../src/meta-leads/index.js";
import {
  aForm,
  anAgency,
  aPage,
  auditOf,
  createTestMeta,
  eventsOf,
  memberOf,
  winterQuestions,
} from "./support/meta.js";

const test = createTestMeta();
afterAll(() => test.close());
const now = new Date("2026-10-23T10:00:00Z");

const reasonOf = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).reason;
};

async function aSetup() {
  const agency = await anAgency(test);
  const member = memberOf(agency);
  const page = await test.db.forOrg(agency, (tx) => aPage(test, tx, agency, { connectedBy: member.userId }));
  test.graph.addLogin(`login-${page.id}`, {
    userId: "u",
    pages: [{ id: page.metaPageId, name: "P", token: page.token, canAdvertise: true }],
  });
  const row = async () => {
    const found = await test.db.forOrg(agency, (tx) => pageOf(tx, page.id));
    if (found === null) throw new Error("page");
    return found;
  };
  return { agency, member, page, row };
}

describe("refreshForms and listForms", () => {
  it("keeps a row for each form Meta lists, not brought in, and reads again only after twenty seconds, so a form just made at Meta shows at once", async () => {
    const { agency, page, row } = await aSetup();
    test.graph.addForm(page.metaPageId, { id: "F1", name: "Winter ad", questions: winterQuestions });
    test.graph.addForm(page.metaPageId, {
      id: "F2",
      name: "Diwali offers",
      status: "ARCHIVED",
      questions: winterQuestions,
    });
    const list = await listForms(test.dependencies, await row(), now);
    expect(list.items.map((form) => [form.name, form.metaStatus, form.state, form.leadsAdded])).toEqual([
      ["Diwali offers", "ARCHIVED", "not_brought_in", 0],
      ["Winter ad", "ACTIVE", "not_brought_in", 0],
    ]);
    const calls = test.graph.calls.byMethod.listForms ?? 0;
    await listForms(test.dependencies, await row(), new Date(now.getTime() + 10_000));
    expect(test.graph.calls.byMethod.listForms).toBe(calls);
    test.graph.addForm(page.metaPageId, { id: "F3", name: "Goa", questions: winterQuestions });
    expect(await refreshForms(test.dependencies, await row(), new Date(now.getTime() + 21_000))).toBe(true);
    expect(await test.db.forOrg(agency, (tx) => tx.metaForm.count())).toBe(3);
  });

  it("renames a form when Meta did, and says the Page must be connected again when the token fails", async () => {
    const { page, row } = await aSetup();
    test.graph.addForm(page.metaPageId, { id: "F1", name: "Old name", questions: winterQuestions });
    await refreshForms(test.dependencies, await row(), now, { force: true });
    test.graph.addForm(page.metaPageId, { id: "F1", name: "New name", questions: winterQuestions });
    await refreshForms(test.dependencies, await row(), now, { force: true });
    expect((await listForms(test.dependencies, await row(), now)).items.map((form) => form.name)).toEqual(["New name"]);
    test.graph.expireToken(page.token);
    expect(await reasonOf(refreshForms(test.dependencies, await row(), now, { force: true }))).toBe(
      "META_PERMISSION_MISSING",
    );
  });
});

describe("formQuestions", () => {
  it("shows the defaults for a form not brought in, and the checklist", async () => {
    const { page, row } = await aSetup();
    test.graph.addForm(page.metaPageId, { id: "F1", name: "Winter ad", questions: winterQuestions });
    await refreshForms(test.dependencies, await row(), now, { force: true });
    const forms = (await listForms(test.dependencies, await row(), now)).items;
    const view = await formQuestions(test.dependencies, await row(), forms[0]?.id ?? "");
    expect(view.questions.map((question) => [question.key, question.field, question.example])).toEqual([
      ["full_name", "name", null],
      ["phone_number", "phone", null],
      ["email", "email", null],
      ["where_to", "destination", null],
    ]);
    expect(view).toMatchObject({ hasName: true, hasContact: true });
  });
});

describe("bringInForm", () => {
  async function aFormToBringIn(questions = winterQuestions) {
    const setup = await aSetup();
    test.graph.addForm(setup.page.metaPageId, { id: `F-${setup.page.id}`, name: "Winter ad", questions });
    await refreshForms(test.dependencies, await setup.row(), now, { force: true });
    const form = await test.db.forOrg(setup.agency, (tx) => tx.metaForm.findFirstOrThrow());
    return { ...setup, form };
  }

  it("stores the match, runs the form from now, audits it and asks for what it skipped", async () => {
    const { agency, member, page, form } = await aFormToBringIn();
    await bringInForm(
      test.dependencies,
      member,
      { pageId: page.id, formId: form.id, earlierLeads: "only_new", questions: [{ key: "where_to", field: "note" }] },
      now,
    );
    const stored = await test.db.forOrg(agency, async (tx) => ({
      form: await tx.metaForm.findUniqueOrThrow({ where: { id: form.id } }),
      matches: await storedMatches(tx, form.id),
    }));
    expect(stored.form).toMatchObject({ state: "running", catchupCursor: BigInt(Math.floor(now.getTime() / 1000)) });
    expect(stored.form.questionsHash).not.toBeNull();
    // The person chose the note for the destination question; the rest are the defaults.
    expect(Object.fromEntries(stored.matches.map((match) => [match.key, match.field]))).toEqual({
      full_name: "name",
      phone_number: "phone",
      email: "email",
      where_to: "note",
    });
    expect((await auditOf(test, agency, page.id)).map((entry) => entry.action)).toEqual(["meta.form-brought-in"]);
    expect((await eventsOf(test, agency, ["meta.form-brought-in"])).map(([, payload]) => payload)).toEqual([
      { pageId: page.id, formId: form.id, earlierLeads: false },
    ]);
  });

  it("starts the cursor before the first lead it skipped, so those are caught up", async () => {
    const { agency, member, page, form } = await aFormToBringIn();
    await test.db.forOrg(agency, (tx) =>
      tx.metaForm.update({ where: { id: form.id }, data: { catchupCursor: 1_761_000_000n, skippedLeads: 2 } }),
    );
    await bringInForm(
      test.dependencies,
      member,
      { pageId: page.id, formId: form.id, earlierLeads: "only_new", questions: [] },
      now,
    );
    expect(
      (await test.db.forOrg(agency, (tx) => tx.metaForm.findUniqueOrThrow({ where: { id: form.id } }))).catchupCursor,
    ).toBe(1_761_000_000n);
  });

  it("with the last 30 days starts at now and asks for the import in the event", async () => {
    const { agency, member, page, form } = await aFormToBringIn();
    await bringInForm(
      test.dependencies,
      member,
      { pageId: page.id, formId: form.id, earlierLeads: "last_30_days", questions: [] },
      now,
    );
    expect((await eventsOf(test, agency, ["meta.form-brought-in"]))[0]?.[1]).toMatchObject({ earlierLeads: true });
  });

  it("refuses a form with no name or no contact, and one already brought in", async () => {
    const noName = await aFormToBringIn([{ key: "phone_number", type: "phone", label: "Phone" }]);
    expect(
      await reasonOf(
        bringInForm(
          test.dependencies,
          noName.member,
          { pageId: noName.page.id, formId: noName.form.id, earlierLeads: "only_new", questions: [] },
          now,
        ),
      ),
    ).toBe("META_FORM_INCOMPLETE");
    const noContact = await aFormToBringIn([{ key: "full_name", type: "full_name", label: "Name" }]);
    expect(
      await reasonOf(
        bringInForm(
          test.dependencies,
          noContact.member,
          { pageId: noContact.page.id, formId: noContact.form.id, earlierLeads: "only_new", questions: [] },
          now,
        ),
      ),
    ).toBe("META_FORM_INCOMPLETE");
    const done = await aFormToBringIn();
    const input = { pageId: done.page.id, formId: done.form.id, earlierLeads: "only_new" as const, questions: [] };
    await bringInForm(test.dependencies, done.member, input, now);
    expect(await reasonOf(bringInForm(test.dependencies, done.member, input, now))).toBe("META_PAGE_NOT_READY");
  });

  it("refuses a form of another Page or agency", async () => {
    const one = await aFormToBringIn();
    const other = await aSetup();
    expect(
      await reasonOf(
        bringInForm(
          test.dependencies,
          other.member,
          { pageId: other.page.id, formId: one.form.id, earlierLeads: "only_new", questions: [] },
          now,
        ),
      ),
    ).toBe("META_FORM_NOT_FOUND");
  });
});

describe("saveQuestions", () => {
  it("replaces the match, audits it, and shows a question Meta added as new and in the note", async () => {
    const setup = await aSetup();
    const formId = `F-${setup.page.id}`;
    test.graph.addForm(setup.page.metaPageId, { id: formId, name: "Winter ad", questions: winterQuestions });
    const form = await test.db.forOrg(setup.agency, (tx) => aForm(tx, setup.page.id, { formId }));
    await saveQuestions(
      test.dependencies,
      setup.member,
      { pageId: setup.page.id, formId: form.id, questions: [{ key: "where_to", field: "note" }] },
      now,
    );
    expect(
      Object.fromEntries(
        (await test.db.forOrg(setup.agency, (tx) => storedMatches(tx, form.id))).map((match) => [
          match.key,
          match.field,
        ]),
      ),
    ).toMatchObject({ where_to: "note" });
    test.graph.setQuestions(formId, [
      ...winterQuestions,
      { key: "how_many", type: "custom", label: "How many people?" },
    ]);
    const view = await formQuestions(test.dependencies, await setup.row(), form.id);
    const added = view.questions.find((question) => question.key === "how_many");
    expect(added).toMatchObject({ isNew: true, field: "note" });
    expect((await auditOf(test, setup.agency, setup.page.id)).map((entry) => entry.action)).toContain(
      "meta.form-questions-changed",
    );
  });

  it("returns a form that needed attention to running once its questions are matched again", async () => {
    const setup = await aSetup();
    const formId = `F-${setup.page.id}`;
    test.graph.addForm(setup.page.metaPageId, { id: formId, name: "Winter ad", questions: winterQuestions });
    const form = await test.db.forOrg(setup.agency, (tx) =>
      aForm(tx, setup.page.id, { formId, state: "needs_attention" }),
    );
    await saveQuestions(
      test.dependencies,
      setup.member,
      { pageId: setup.page.id, formId: form.id, questions: [] },
      now,
    );
    expect(
      (await test.db.forOrg(setup.agency, (tx) => tx.metaForm.findUniqueOrThrow({ where: { id: form.id } }))).state,
    ).toBe("running");
  });

  it("is refused for a form not brought in", async () => {
    const setup = await aSetup();
    test.graph.addForm(setup.page.metaPageId, { id: `F-${setup.page.id}`, name: "x", questions: winterQuestions });
    const form = await test.db.forOrg(setup.agency, (tx) =>
      aForm(tx, setup.page.id, { formId: `F-${setup.page.id}`, state: "not_brought_in" }),
    );
    expect(
      await reasonOf(
        saveQuestions(test.dependencies, setup.member, { pageId: setup.page.id, formId: form.id, questions: [] }, now),
      ),
    ).toBe("META_PAGE_NOT_READY");
  });
});
