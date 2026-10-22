// What happens to the people who use the form (spec 13, journeys 3, 4 and 11): a visitor whose number has an open lead
// asks again on it and changes nobody, a person whose leads are all closed comes back, a blocked number and a fourth
// enquiry in a day get the same thank-you and save nothing, every outcome is answered alike, one submission id is one lead
// however often it is sent, and erasing a customer takes the form's ledger ids with them.
import type { APIRequestContext, APIResponse, Page } from "@playwright/test";
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { expect, signInByEmail, test as base } from "./support/fixtures";
import { signInToConsole, test as consoleTest } from "./support/console";
import { consoleCall } from "./support/console-platform";
import { addLeadThroughApi, callApi, leadInput, moveStageThroughApi } from "./support/leads";
import {
  fillVisitor,
  keyOf,
  leadsOfPhone,
  newAddress,
  newPhone,
  openForm,
  openHosted,
  postEnquiry,
  timelineOf,
  turnOnForm,
  viaProxy,
  visitorsDevice,
} from "./support/website-form";

const from = () => viaProxy(newAddress());

/** The things a visitor can be: new, someone with an open lead, someone whose leads are closed, a blocked number. */
async function setUpPeople(page: Page) {
  const phones = { open: newPhone(), closed: newPhone(), blocked: newPhone() };
  await addLeadThroughApi(page, leadInput({ person: { name: "Rahul Sharma", phone: phones.open } }));
  const closed = await addLeadThroughApi(page, leadInput({ person: { name: "Anita Das", phone: phones.closed } }));
  await moveStageThroughApi(page, closed, "lost");
  const blocked = await addLeadThroughApi(page, leadInput({ person: { name: "Spam Sam", phone: phones.blocked } }));
  await callApi(page, "leads.block", { leadId: blocked });
  return phones;
}

interface Case {
  name: string;
  phone: string;
  response: APIResponse;
}

/** Sends an enquiry in every situation of journeys 3 and 4, in order, each from an address of its own. */
async function everySituation(page: Page, request: APIRequestContext, key: string): Promise<Case[]> {
  const phones = await setUpPeople(page);
  const { openedToken } = await openForm(request, key, { headers: from() });
  const send = async (name: string, phone: string, more: Record<string, unknown> = {}): Promise<Case> => ({
    name,
    phone,
    response: await postEnquiry(request, key, { phone, openedToken, ...more }, from()),
  });
  const fresh = newPhone();
  const first = await send("a new person", fresh);
  const cases = [
    first,
    await send("an open lead", phones.open, { email: "rahul.other@example.com", name: "Rahul S" }),
    await send("closed leads", phones.closed),
    await send("a blocked number", phones.blocked),
  ];
  const busy = newPhone();
  for (const turn of ["first", "second", "third"]) await send(`busy ${turn}`, busy);
  cases.push(await send("a fourth in a day", busy));
  // The same submission id again, as a retry after a sleep sends it.
  const body = { submissionId: crypto.randomUUID() };
  const once = await send("a submission", newPhone(), body);
  cases.push(await send("the same submission again", once.phone, body));
  cases.push(await send("a filled trap", newPhone(), { homepage: "x" }));
  return cases;
}

base(
  "an open lead gets the repeat enquiry and the person is unchanged; closed leads return; blocked and a fourth save nothing",
  async ({ page, request, browser, agency }) => {
    await signInByEmail(page, agency.owner);
    const key = keyOf(await turnOnForm(page));
    const phones = await setUpPeople(page);

    // The visitor, in a browser, whose number has an open lead: the same thank-you as anyone's.
    const visitor = await visitorsDevice(browser);
    const visitorPage = await openHosted(visitor, key);
    await fillVisitor(visitorPage, { name: "Rahul S", phone: phones.open });
    await visitorPage.getByLabel("Email", { exact: true }).fill("rahul.other@example.com");
    await expect(visitorPage.getByRole("button", { name: "Send enquiry" })).toBeEnabled();
    await visitorPage.waitForTimeout(2_200);
    await visitorPage.getByRole("button", { name: "Send enquiry" }).click();
    await expect(visitorPage.getByRole("heading", { level: 1, name: "Thank you" })).toBeVisible();
    await expect(visitorPage.getByText("Thank you! Sharma Travels will get in touch with you soon.")).toBeVisible();
    await visitor.close();

    const [openLead, ...others] = await leadsOfPhone(page, phones.open);
    expect(others).toEqual([]);
    expect(openLead).toMatchObject({ stage: "new", person: { name: "Rahul Sharma" } });
    const timeline = await timelineOf(page, openLead?.id ?? "");
    const asked = timeline.entries.find((entry) => entry.kind === "repeat-enquiry");
    expect(asked).toMatchObject({ kind: "repeat-enquiry", enquiry: { source: "web_form" } });
    expect(asked?.kind === "repeat-enquiry" ? asked.enquiry.note : "").toContain(
      "Email given: rahul.other@example.com",
    );
    const detail = await callApi<LeadDetail>(page, "leads.get", { leadId: openLead?.id });
    expect(detail.person).toMatchObject({ name: "Rahul Sharma", email: null });

    const { openedToken } = await openForm(request, key, { headers: from() });
    // All leads closed: a new lead for the same person, marked Returning.
    expect((await postEnquiry(request, key, { phone: phones.closed, openedToken }, from())).status()).toBe(201);
    const afterClosed = await leadsOfPhone(page, phones.closed);
    expect(afterClosed).toHaveLength(2);
    expect(afterClosed.filter((lead) => lead.returning)).toHaveLength(1);

    // A blocked number: the thank-you, and no lead of the enquiry's.
    expect((await postEnquiry(request, key, { phone: phones.blocked, openedToken }, from())).status()).toBe(201);
    const blocked = await leadsOfPhone(page, phones.blocked);
    expect(blocked.map((lead) => lead.stage)).toEqual(["not_a_lead"]);

    // A fourth enquiry from one person in a day: the thank-you, nothing saved.
    const busy = newPhone();
    for (let turn = 0; turn < 4; turn += 1) {
      expect((await postEnquiry(request, key, { phone: busy, openedToken }, from())).status()).toBe(201);
    }
    const [busyLead, ...rest] = await leadsOfPhone(page, busy);
    expect(rest).toEqual([]);
    const repeats = (await timelineOf(page, busyLead?.id ?? "")).entries.filter(
      (entry) => entry.kind === "repeat-enquiry",
    );
    expect(repeats).toHaveLength(2);
  },
);

base("every outcome that is not a refusal is answered alike", async ({ page, request, agency }) => {
  // Seven situations, each sent from an address of its own, and the machine may be busy.
  base.slow();
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const cases = await everySituation(page, request, key);
  const answers = await Promise.all(
    cases.map(async ({ name, response }) => {
      const headers = Object.entries(response.headers())
        .filter(([header]) => !["date", "x-request-id"].includes(header))
        .toSorted(([a], [b]) => a.localeCompare(b));
      return { name, status: response.status(), body: await response.text(), headers };
    }),
  );
  const [reference, ...others] = answers;
  expect(reference?.status).toBe(201);
  expect(reference?.body).toBe('{"ok":true}');
  for (const answer of others) {
    expect({ case: answer.name, status: answer.status, body: answer.body, headers: answer.headers }).toEqual({
      case: answer.name,
      status: reference?.status,
      body: reference?.body,
      headers: reference?.headers,
    });
  }
});

base("one submission id is one lead, however often it is sent, even at once", async ({ page, request, agency }) => {
  await signInByEmail(page, agency.owner);
  const key = keyOf(await turnOnForm(page));
  const { openedToken } = await openForm(request, key, { headers: from() });
  const phone = newPhone();
  const submissionId = crypto.randomUUID();
  const sends = await Promise.all(
    [0, 1].map(() => postEnquiry(request, key, { phone, openedToken, submissionId }, from())),
  );
  expect(sends.map((response) => response.status())).toEqual([201, 201]);
  // The retry after a sleep.
  expect((await postEnquiry(request, key, { phone, openedToken, submissionId }, from())).status()).toBe(201);
  expect(await leadsOfPhone(page, phone)).toHaveLength(1);
});

consoleTest(
  "erasing a customer takes their lead and the form's ledger ids with it",
  async ({ page, request, browser, agency, database, superAdmin }) => {
    // The export, the queued job and its run each take a moment.
    consoleTest.slow();
    await signInByEmail(page, agency.owner);
    const key = keyOf(await turnOnForm(page));
    const { openedToken } = await openForm(request, key, { headers: from() });
    const phone = newPhone();
    const submissionId = crypto.randomUUID();
    expect((await postEnquiry(request, key, { phone, openedToken, submissionId }, from())).status()).toBe(201);
    const [lead] = await leadsOfPhone(page, phone);
    const personId = (await callApi<LeadDetail>(page, "leads.get", { leadId: lead?.id })).person.id;
    const ledger = () =>
      database.platform.websiteFormSubmission.findFirstOrThrow({
        where: { organizationId: agency.organizationId, submissionId },
      });
    expect(await ledger()).toMatchObject({ outcome: "new_lead", leadId: lead?.id, personId });

    // Support, in a browser of their own, exports what is kept about the person and has them erased.
    const staff = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "" });
    const console = await staff.newPage();
    await signInToConsole(console, superAdmin);
    const subject = { kind: "record", recordType: "person", recordId: personId };
    await consoleCall(console, "dataProtection.exportSubject", { organizationId: agency.organizationId, subject });
    await consoleCall(console, "dataProtection.requestErasure", {
      organizationId: agency.organizationId,
      subject,
      confirmation: agency.code,
    });
    await expect
      .poll(async () => (await ledger()).personId, { timeout: 60_000, message: "the erasure job runs" })
      .toBeNull();
    expect(await ledger()).toMatchObject({ outcome: "new_lead", leadId: null, personId: null });
    expect(await leadsOfPhone(page, phone)).toEqual([]);
    await staff.close();
  },
);
