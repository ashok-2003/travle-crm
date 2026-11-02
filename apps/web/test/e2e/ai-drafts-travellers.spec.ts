// AI part 4a (release ai3), on a phone and a desktop, against the real api and worker with the fake AI (support/fake-openrouter.ts):
// - "Draft the days" on a quote, with a package of the agency's for the place and without one: the days arrive in violet, the
//   fake's typed amount is taken out and said so, nothing is saved until the quote is, and the save is audited as drafted by AI;
// - a booking's travellers filled from a voice note, then from a passport photo: each person beside the row they fill, an age
//   alone left as an age, the passport checked by its printed code lines, the rows saved together, the recording and photo kept
//   as sensitive files, and nothing of the people in the fill's row or the audit log.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { acceptedQuote } from "./support/bookings";
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, dayInIndia, leadInput } from "./support/leads";
import { aDestination, aPackage, updatePackage } from "./support/packages";
import { inAgency } from "./support/whatsapp";

const shots = path.join(process.cwd(), "..", "..", "shots", "ai3a");
const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";
const fakeOpenRouter = () => process.env.E2E_AI_URL ?? "";

/** A picture of the screen at the sizes the review looks at (a phone 390 wide, a desktop 1440), then the journey's own size again. */
async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  mkdirSync(shots, { recursive: true });
  const before = page.viewportSize();
  await page.setViewportSize(isPhone(testInfo) ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(shots, `${testInfo.project.name}-${name}.png`) });
  if (before !== null) await page.setViewportSize(before);
}

const turnOnAi = (page: Page) =>
  callApi(page, "ai.saveSettings", { enabled: true, scoring: true, writeStyle: "warm", instructions: "" });

/** What the fake AI was sent by the feature whose rules start with `marker`. */
async function requestsOf(marker: string): Promise<string[]> {
  const all = (await (await fetch(`${fakeOpenRouter()}/_requests`)).json()) as {
    body: { messages: { content: unknown }[] };
  }[];
  return all
    .filter((one) => JSON.stringify(one.body.messages[0]?.content).includes(marker))
    .map((one) => JSON.stringify(one.body.messages));
}

/** A draft quote with one priced line and no days, for a Manali trip of five days. */
async function manaliQuote(page: Page): Promise<string> {
  const leadId = await addLeadThroughApi(
    page,
    leadInput({
      trip: {
        destination: { kind: "new", name: "Manali" },
        when: { kind: "dates", from: dayInIndia(30), to: dayInIndia(34) },
        adults: 2,
        childrenAges: [9],
        hotelCategory: "4_star",
        food: "jain",
      },
    }),
  );
  const quote = await callApi<{ id: string }>(page, "quotes.create", {
    leadId,
    title: "Manali for four",
    startDate: dayInIndia(30),
    adults: 2,
    children: 1,
    days: [],
    items: [{ description: "Package per adult", detail: "", quantity: 2, unitPricePaise: 450_000 }],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 500,
    placeOfSupply: null,
  });
  return quote.id;
}

async function draftDays(page: Page, testInfo: TestInfo, quoteId: string, shot: string) {
  await page.goto(`/quotes/${quoteId}`);
  // Both buttons are there with the form, side by side or wrapped on a phone.
  await expect(page.getByRole("button", { name: "Fill with AI" })).toBeVisible();
  await page.getByRole("button", { name: "Draft the days" }).click();
  const sheet = page.getByRole("dialog", { name: "Draft the days" });
  await sheet.getByLabel("Anything to keep in mind? (optional)").fill("relaxed, no long drives");
  await sheet.getByRole("button", { name: "Draft the days" }).click();
  await expect(sheet.getByText("Arrive in Manali")).toBeVisible();
  // The fake's first day names an amount of its own: it is taken out, and staff are told.
  await expect(sheet.getByText(/The AI typed an amount of its own and it was taken out/)).toBeVisible();
  await expect(sheet.getByText(/4,500/)).toHaveCount(0);
  await expect(sheet.getByRole("checkbox", { name: /Day plan/ })).toBeChecked();
  await expectAccessible(page);
  await shoot(page, testInfo, shot);
  return sheet;
}

test("Draft the days from the trip alone: five days in violet, an amount taken out, saved as drafted by AI", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const quoteId = await manaliQuote(page);
  const sheet = await draftDays(page, testInfo, quoteId, "draft-days-proposal");
  await expect(sheet.getByText(/From your packages/)).toHaveCount(0);

  await sheet.getByRole("button", { name: /^Apply/ }).click();
  await expect(page.getByLabel("Day 1", { exact: true })).toHaveValue("Arrive in Manali");
  await expect(page.getByLabel("Day 5", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Day 6", { exact: true })).toHaveCount(0);
  expect(await page.getByLabel("What happens").first().inputValue()).not.toContain("4,500");
  expect(await page.locator("[data-ai-filled]").count()).toBeGreaterThanOrEqual(1);
  // Nothing was saved by drafting.
  expect(
    (await inAgency(agency.organizationId, (tx) => tx.quote.findUniqueOrThrow({ where: { id: quoteId } }))).days,
  ).toEqual([]);

  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText("Quote saved")).toBeVisible();
  const [entry] = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(entry?.after).toMatchObject({ target: "quote_days", applied: ["quote.days"] });
  expect(JSON.stringify(entry)).not.toMatch(/Manali|relaxed|Arrive/);

  // The model got the trip and the note, a tone for the budget at most, and no price.
  const sent = (await requestsOf("DRAFT_DAYS:")).at(-1);
  expect(sent).toContain("Days: 5");
  expect(sent).toContain("Place: Manali");
  expect(sent).toContain("Children's ages: 9");
  expect(sent).toContain("relaxed, no long drives");
  expect(sent).not.toContain("The agency's own plans");
  expect(sent).not.toMatch(/4,500|450000|₹/);
});

test("Draft the days adapts the agency's own package for the place and says which", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const destinationId = await aDestination(page, "Manali");
  const packageId = await aPackage(page, "Manali 4N");
  await updatePackage(page, packageId, {
    destinationId,
    nights: 4,
    days: [
      { title: "Arrive in Manali", description: "Check in and rest." },
      { title: "Solang Valley", description: "Snow activities." },
    ],
  });
  const quoteId = await manaliQuote(page);
  const sheet = await draftDays(page, testInfo, quoteId, "draft-days-with-package");
  await expect(sheet.getByText(/From your packages: “Manali 4N”/)).toBeVisible();
  const sent = (await requestsOf("DRAFT_DAYS:")).at(-1);
  expect(sent).toContain("The agency's own plans for this place");
  expect(sent).toContain("Solang Valley");
});

/** A booking of two adults and a third traveller row, confirmed. */
async function aBooking(page: Page, browser: Parameters<typeof acceptedQuote>[1]) {
  const { bookingId } = await acceptedQuote(page, browser, { name: "Rahul Sharma", phone: "+919876543210", adults: 3 });
  await callApi(page, "bookings.confirm", { bookingId });
  return bookingId;
}

test("travellers are filled from a voice note: each person beside a row, an age left as an age, saved together", async ({
  page,
  browser,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  // A microphone that hears a tone, in place of the person's own.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      await context.resume();
      const tone = context.createOscillator();
      const destination = context.createMediaStreamDestination();
      tone.connect(destination);
      tone.start();
      return destination.stream;
    };
  });
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const bookingId = await aBooking(page, browser);
  await page.goto(`/bookings/${bookingId}`);
  const card = page.getByRole("region", { name: "Travellers" });
  await expect(card.getByRole("button", { name: "Fill with AI" })).toBeVisible();
  await card.getByRole("button", { name: "Fill with AI" }).click();
  const sheet = page.getByRole("dialog", { name: "Fill in the travellers" });
  await sheet.getByRole("button", { name: "Speak" }).click();
  await expect(sheet.getByRole("button", { name: /^Stop/ })).toBeVisible();
  await page.waitForTimeout(1500);
  await sheet.getByRole("button", { name: /^Stop/ }).click();
  await expect(sheet.getByText("Recording ready")).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole("button", { name: "Read the travellers" }).click();

  // Each person beside the row they fill; an age is an age, never a birthday.
  await expect(sheet.getByText("Ramesh Sharma").first()).toBeVisible();
  await expect(sheet.getByText(/Only an age was said \(12\): the date of birth is still needed\./)).toBeVisible();
  await expect(sheet.getByRole("combobox", { name: "Row for Aarav" })).toContainText("Traveller 3");
  await expect(sheet.getByRole("checkbox", { name: /Born/ })).toHaveCount(1);
  await expectAccessible(page);
  await shoot(page, testInfo, "travellers-proposal-voice");
  expect(
    (await inAgency(agency.organizationId, (tx) => tx.bookingTraveller.findMany({ where: { bookingId } }))).every(
      (row) => row.name === "",
    ),
  ).toBe(true);

  await sheet.getByRole("button", { name: "Save 3 travellers" }).click();
  await expect(page.getByText("3 travellers saved")).toBeVisible();
  await expect(card.getByText("Ramesh Sharma")).toBeVisible();
  await expect(card.getByText("Aarav")).toBeVisible();
  const rows = await inAgency(agency.organizationId, (tx) =>
    tx.bookingTraveller.findMany({ where: { bookingId }, orderBy: { position: "asc" } }),
  );
  expect(rows.map((row) => row.name)).toEqual(["Ramesh Sharma", "Sunita Sharma", "Aarav"]);
  expect(rows[0]?.dateOfBirth?.toISOString().slice(0, 10)).toBe("1980-06-12");
  expect(rows[2]?.dateOfBirth).toBeNull();

  // The recording is kept as a sensitive input; the fill's row and the audit log hold nothing of the people.
  const [input] = await inAgency(agency.organizationId, (tx) =>
    tx.attachment.findMany({ where: { recordType: "ai_input" } }),
  );
  expect(input).toMatchObject({ sensitive: true, contentType: "audio/wav" });
  const fill = await inAgency(agency.organizationId, (tx) => tx.aiFill.findMany({ where: { target: "travellers" } }));
  expect(fill).toMatchObject([
    { fields: ["travellers"], fieldHashes: { travellers: "sensitive" }, appliedFields: ["travellers"] },
  ]);
  expect(JSON.stringify(fill)).not.toMatch(/Ramesh|Sunita|Aarav|1980/);
  const audit = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(audit).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toMatch(/Ramesh|Sunita|Aarav|1980/);
});

test("a passport photo fills a traveller: the number, birth and expiry come from the checked code lines", async ({
  page,
  browser,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const bookingId = await aBooking(page, browser);
  await page.goto(`/bookings/${bookingId}`);
  const card = page.getByRole("region", { name: "Travellers" });
  await card.getByRole("button", { name: "Fill with AI" }).click();
  const sheet = page.getByRole("dialog", { name: "Fill in the travellers" });
  // A photo of a passport's data page, a 1x1 picture here: the fake reads a passport out of any photo.
  await sheet.getByLabel("Add a photo of a list or an ID").setInputFiles({
    name: "passport.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(sheet.getByText("Screenshot ready")).toBeVisible();
  await sheet.getByRole("button", { name: "Read the travellers" }).click();

  await expect(sheet.getByText(/Z1234567, issued 2 Jan 2025, expires 1 Jan 2035, IND/)).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: /Born 12 Jun 1980/ })).toBeChecked();
  await expect(sheet.getByText(/Read from the passport's printed code lines/)).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "travellers-proposal-passport");

  await sheet.getByRole("button", { name: "Save 1 traveller" }).click();
  await expect(page.getByText("1 traveller saved")).toBeVisible();
  const row = await inAgency(agency.organizationId, (tx) =>
    tx.bookingTraveller.findFirstOrThrow({ where: { bookingId, name: "Rahul Sharma" } }),
  );
  const identity = await inAgency(agency.organizationId, (tx) =>
    tx.bookingTravellerIdentity.findFirstOrThrow({ where: { travellerId: row.id } }),
  );
  expect(identity).toMatchObject({ kind: "passport", number: "Z1234567", nationality: "IND" });
  expect(row.gender).toBe("male");
  // The photo is a sensitive input, and neither the fill's row nor the audit log holds the number or the birth date.
  const [input] = await inAgency(agency.organizationId, (tx) =>
    tx.attachment.findMany({ where: { recordType: "ai_input" } }),
  );
  expect(input).toMatchObject({ sensitive: true, contentType: "image/png" });
  const fill = await inAgency(agency.organizationId, (tx) => tx.aiFill.findMany({ where: { target: "travellers" } }));
  const audit = await inAgency(agency.organizationId, (tx) => tx.auditEntry.findMany());
  expect(JSON.stringify([fill, audit])).not.toMatch(/Z1234567|1980-06-12|12 June 1980/);
  // The model was asked to copy the lines, never to read another ID's number.
  const sent = (await requestsOf("FILL_TRAVELLERS:")).at(-1);
  expect(sent).toContain("never write, copy or hint at the ID's number");
});
