// AI part 3 (release ai3), on a phone and a desktop, against the real api and worker with the fake AI (support/fake-openrouter.ts):
// - "Read requests" on a departure's Rooming tab: the AI reads the travellers' room notes and proposes a request with the words it
//   read; staff tick and Apply through the rooming list's own update (audited as drafted by AI); a traveller with nothing to read
//   is left out, and what the model was sent holds no phone number;
// - "Find interested people" on a departure with empty seats: a plain list (not the lead who asked about another place, nobody
//   blocked), a personal message for each ticked person with the price put in by code and no seat count or typed amount, opened in
//   WhatsApp through wa.me in a new tab and marked sent, which leaves the person out of the next list.
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { Page, TestInfo } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { aDeparture, bookedOn, ownDeparture } from "./support/departures";
import { saveBusinessProfile } from "./support/documents";
import { expect, signInByEmail, test } from "./support/fixtures";
import { addLeadThroughApi, callApi, dayInIndia, leadInput } from "./support/leads";
import { inAgency } from "./support/whatsapp";

const shots = path.join(process.cwd(), "..", "..", "shots", "ai2c");
const ai3aShots = path.join(process.cwd(), "..", "..", "shots", "ai3a");
const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";
const fakeOpenRouter = () => process.env.E2E_AI_URL ?? "";

/** A picture of the screen at the sizes the review looks at (a phone 390 wide, a desktop 1440), then the journey's own size again. */
async function shoot(page: Page, testInfo: TestInfo, name: string, folder = shots): Promise<void> {
  mkdirSync(folder, { recursive: true });
  const before = page.viewportSize();
  await page.setViewportSize(isPhone(testInfo) ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.screenshot({ path: path.join(folder, `${testInfo.project.name}-${name}.png`) });
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

test("the AI reads travellers' room notes, staff tick and apply, and nothing else changes", async ({
  page,
  browser,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const departureId = await aDeparture(page, { title: "Chardham batch", seats: 10 });
  await bookedOn(page, browser, departureId, { name: "Meena Kapoor", phone: "+919876500121", adults: 3 });
  await callApi(page, "departures.rooming.saveStay", {
    departureId,
    hotelName: "Hotel Himalaya",
    supplierId: null,
    checkIn: dayInIndia(10),
    checkOut: dayInIndia(12),
  });
  const rooming = await callApi<{ stays: { unassigned: { travellerId: string }[] }[] }>(
    page,
    "departures.rooming.get",
    { departureId },
  );
  const [first, second, third] = rooming.stays[0]?.unassigned.map((one) => one.travellerId) ?? [];
  const traveller = (travellerId: string | undefined, name: string, roomNote: string) =>
    callApi(page, "bookings.saveTraveller", {
      travellerId,
      name,
      dateOfBirth: null,
      gender: null,
      phone: "",
      emergencyName: "",
      emergencyPhone: "",
      medicalNotes: "",
      roomRequest: "none",
      roomNote,
      identity: null,
    });
  await traveller(first, "Meena Kapoor", "My mother has a bad knee, ground floor please");
  await traveller(second, "Sunita Kapoor", "");
  await traveller(third, "Ravi Kapoor", "happy to share with anyone");

  await page.goto(`/departures/${departureId}`);
  await page.getByRole("tab", { name: "Rooming" }).click();
  await page.getByRole("button", { name: "Read requests" }).click();
  const sheet = page.getByRole("dialog", { name: "Read room requests" });
  await sheet.getByRole("button", { name: "Read the notes" }).click();
  // One request found, with the words it came from; nothing is set until Apply.
  await expect(sheet.getByRole("checkbox", { name: /Meena Kapoor/ })).toBeChecked();
  await expect(sheet.getByText("Wants the ground floor")).toBeVisible();
  await expect(sheet.getByText(/read from "My mother has a bad knee, ground floor please"/)).toBeVisible();
  await expect(sheet.getByRole("checkbox")).toHaveCount(1);
  await expectAccessible(page);
  await shoot(page, testInfo, "rooming-proposal");
  expect(
    (await inAgency(agency.organizationId, (tx) => tx.bookingTraveller.findMany({ where: { id: first ?? "" } })))[0]
      ?.roomRequest,
  ).toBe("none");

  await sheet.getByRole("button", { name: "Apply 1 request" }).click();
  await expect(page.getByText("1 request set")).toBeVisible();
  await expect(page.getByRole("region", { name: "Hotel Himalaya" })).toContainText("Wants the ground floor");
  const set = await inAgency(agency.organizationId, (tx) =>
    tx.bookingTraveller.findMany({ where: { id: { in: [first ?? "", second ?? "", third ?? ""] } } }),
  );
  expect(Object.fromEntries(set.map((one) => [one.id, one.roomRequest]))).toEqual({
    [first ?? ""]: "ground_floor",
    [second ?? ""]: "none",
    [third ?? ""]: "none",
  });
  const entries = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.fill-applied" } }),
  );
  expect(entries).toHaveLength(1);

  // What the AI was sent: the notes and names, no phone number.
  const [sent] = await requestsOf("READ_REQUESTS.");
  expect(sent).toContain("ground floor please");
  expect(sent).toContain("Sunita Kapoor");
  expect(sent).not.toMatch(/9876500121|\+91/);

  // The rooms are still drafted by the plain code.
  await page.getByRole("button", { name: "Draft rooms" }).click();
  await expect(page.getByText("Rooms drafted")).toBeVisible();
});

test("empty seats: the AI writes a personal message for each person ticked, opened in WhatsApp and marked sent one by one", async ({
  page,
  context,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  await signInByEmail(page, agency.owner);
  await saveBusinessProfile(page);
  await turnOnAi(page);
  const spiti = { kind: "new" as const, name: "Spiti" };
  const priya = await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Priya Nair", phone: "+919876500111" }, trip: { destination: spiti, adults: 2 } }),
  );
  await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Asha Rao", phone: "+919876500112" }, trip: { destination: spiti, adults: 4 } }),
  );
  await addLeadThroughApi(
    page,
    leadInput({
      person: { name: "Goa Person", phone: "+919876500114" },
      trip: { destination: { kind: "new", name: "Goa" }, adults: 2 },
    }),
  );
  const blocked = await addLeadThroughApi(
    page,
    leadInput({ person: { name: "Blocked Person", phone: "+919876500113" }, trip: { destination: spiti } }),
  );
  await callApi(page, "leads.block", { leadId: blocked });
  const [destination] = await callApi<{ id: string }[]>(page, "destinations.search", { query: "Spiti", limit: 5 });
  const { id: departureId } = await callApi<{ id: string }>(page, "departures.create", {
    title: "Spiti batch",
    destinationId: destination?.id ?? null,
    startDate: dayInIndia(20),
    endDate: dayInIndia(25),
    seatsTotal: 10,
    pricePaise: 12_500_00,
    cutoffOn: null,
    notes: "",
    ...ownDeparture,
  });

  // The wa.me link opens a new tab; nothing leaves the test.
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "ok" }),
  );
  await page.goto(`/departures/${departureId}`);
  await page.getByRole("button", { name: "Find interested people" }).click();
  const sheet = page.getByRole("dialog", { name: "Find interested people" });
  await expect(sheet.getByRole("checkbox", { name: /Priya Nair/ })).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: /Asha Rao/ })).toBeVisible();
  await expect(sheet.getByRole("checkbox")).toHaveCount(2);
  await expectAccessible(page);
  await shoot(page, testInfo, "seats-people");

  await sheet.getByRole("checkbox", { name: /Priya Nair/ }).check();
  await sheet.getByRole("button", { name: "Write 1 message" }).click();
  const message = sheet.getByRole("textbox", { name: "Message for Priya Nair" });
  await expect(message).toHaveValue(/Hi Priya!/);
  // The price is the departure's own, put in by code; a seat count and an amount the model typed are gone.
  await expect(message).toHaveValue(/₹12,500\.00 per person plus GST/);
  expect(await message.inputValue()).not.toContain("9,999");
  expect(await message.inputValue()).not.toMatch(/\b4 seats\b/);
  expect(await message.inputValue()).toContain("a few seats");
  // Staff are told the model's own amount and seat count were taken out, so they read the message twice.
  await expect(sheet.getByText(/typed an amount or a number of seats of its own and it was taken out/)).toBeVisible();
  await expectAccessible(page);
  await shoot(page, testInfo, "seats-message");
  await shoot(page, testInfo, "seat-message-note", ai3aShots);

  // Nothing is marked until it is opened in WhatsApp; a person edits the words first.
  await expect(sheet.getByRole("button", { name: "Mark the message to Priya Nair as sent" })).toBeDisabled();
  await message.fill(`${await message.inputValue()}\nSee you there!`);
  const popup = page.waitForEvent("popup");
  await sheet.getByRole("link", { name: "Open the message for Priya Nair in WhatsApp" }).click();
  const opened = await popup;
  const url = new URL(opened.url());
  expect(url.origin + url.pathname).toBe("https://wa.me/919876500111");
  expect(url.searchParams.get("text")).toContain("See you there!");
  await opened.close();
  await sheet.getByRole("button", { name: "Mark the message to Priya Nair as sent" }).click();
  await expect(sheet.getByText("Sent", { exact: true })).toBeVisible();

  const offers = await inAgency(agency.organizationId, (tx) => tx.departureOffer.findMany());
  expect(offers).toMatchObject([{ departureId, leadId: priya }]);
  const notes = await inAgency(agency.organizationId, (tx) => tx.leadNote.findMany({ where: { leadId: priya } }));
  expect(notes.map((note) => note.body).join(" ")).toContain("Offered seats on Spiti batch");
  const audited = await inAgency(agency.organizationId, (tx) =>
    tx.auditEntry.findMany({ where: { action: "ai.offer-sent" } }),
  );
  expect(audited).toMatchObject([{ after: { changedByMember: true } }]);

  // What the AI was sent: no phone, and no count of seats.
  const [sent] = await requestsOf("REACH_OUT.");
  expect(sent).toContain("Spiti batch");
  expect(sent).not.toMatch(/9876500111|\+91/);
  expect(sent).not.toContain("Seats left:");

  // Offered, so the next list leaves Priya out for 14 days.
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: "Find interested people" }).click();
  const again = page.getByRole("dialog", { name: "Find interested people" });
  await expect(again.getByRole("checkbox", { name: /Asha Rao/ })).toBeVisible();
  await expect(again.getByRole("checkbox")).toHaveCount(1);
});
