// An agency answers from its packages only (the grounded agent): the Owner is refused the switch until a package is sellable,
// makes the Manali group package sellable and turns it on; a customer asks for Spiti (not run) and gets Manali, asks for
// December and gets the peak season's price as code wrote it, a reply that types its own price is never sent and the team is
// told, and "Book" sends the QR and the payment words, holds the seats and waits on Payments to check. The model is the fake
// of support/fake-openrouter.ts: it answers with placeholders, and the screen shows what code filled in.
import { expectAccessible } from "./support/accessibility";
import { saveBusinessProfile } from "./support/documents";
import { signInToConsole, expect, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { nextTwelfthOfDecember } from "./support/fake-openrouter";
import { dayInIndia } from "./support/leads";
import { aPackage } from "./support/packages";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  openNewChat,
  sentTo,
} from "./support/whatsapp";

test.use({ actionTimeout: 15_000 });

/** A one-pixel picture, which storage takes as a payment QR. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const inputDay = (day: string): string => day.split("-").reverse().join("/");

test("an Owner switches an agency to answering from its packages only, and a customer is quoted, refused a made-up price, and booked", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(480_000);
  const consolePage = await browser.newPage();
  await signInToConsole(consolePage, superAdmin);
  const business = await connectNumber(consolePage, agency.organizationId);
  await consolePage.close();
  const owner = page;
  await signInByEmail(owner, agency.owner);
  await saveBusinessProfile(owner);

  // The AI and the autopilot are on, and "Answer from your packages only" is refused while nothing is sellable.
  await owner.goto("/settings/ai");
  await expect(owner.getByRole("heading", { level: 1, name: "AI sales agent" })).toBeVisible();
  await owner.getByLabel("Let the AI draft replies and guess how leads will go").click();
  await owner.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByText("AI settings saved")).toBeVisible();
  const autopilot = owner.getByRole("switch", { name: "Let the AI answer WhatsApp chats by itself" });
  await expect(autopilot).toBeEnabled();
  await autopilot.click();
  const grounded = owner.getByRole("switch", { name: "Answer from your packages only" });
  await grounded.click();
  await owner.getByRole("button", { name: "Save the autopilot" }).click();
  await expect(owner.getByText("Make at least one package sellable by the AI first.")).toBeVisible();
  await expectAccessible(owner);

  // The Manali group package: rooms, seats, an advance of ₹2,000 each, a regular and a peak season, the payment words and a QR.
  const today = dayInIndia(0);
  const twelfth = nextTwelfthOfDecember(today);
  const year = twelfth.slice(0, 4);
  const peakFrom = today > `${year}-12-01` ? today : `${year}-12-01`;
  const packageId = await aPackage(owner, "Manali 5N6D");
  await inAgency(agency.organizationId, async (tx) => {
    const destination = await tx.destination.create({ data: { name: "Manali" }, select: { id: true } });
    await tx.quoteTemplate.update({ where: { id: packageId }, data: { destinationId: destination.id } });
  });
  await owner.goto(`/packages/${packageId}`);
  await owner.getByRole("radio", { name: "A group trip that departs on set dates" }).check();
  await owner.getByRole("button", { name: "Double", exact: true }).click();
  await owner.getByRole("button", { name: "Fri", exact: true }).click();
  await owner.getByRole("button", { name: "Sat", exact: true }).click();
  await owner.getByLabel("Nights", { exact: true }).fill("5");
  await owner.getByLabel("Seats on each departure").fill("20");
  await owner.getByLabel("Starts from").fill("Delhi");
  await owner.getByLabel("Advance to hold a seat (each person)").fill("2,000");
  await owner.getByRole("switch", { name: "Prices include GST" }).check();
  await owner.getByLabel("Pickup points").fill("Kashmere Gate");
  await owner.getByRole("button", { name: "Save package" }).click();
  await expect(owner.getByText("Saved").first()).toBeVisible();
  const seasons = owner.getByRole("region", { name: "Seasons and room prices" });
  const addSeason = async (label: string, from: string, to: string, double: string) => {
    await seasons.getByRole("button", { name: "Add a season" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(label);
    await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(from));
    await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(to));
    await dialog.getByLabel("Double, per person").fill(double);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(seasons).toContainText(label);
  };
  if (today < peakFrom) await addSeason("Regular", today, `${year}-11-30`, "7,799");
  await addSeason("Dec peak", peakFrom, `${String(Number(year) + 1)}-01-31`, "9,999");
  await expect(owner.getByRole("region", { name: "Departures" })).toContainText("20 of 20");
  const payments = owner.getByRole("region", { name: "Where customers pay" });
  await payments.getByLabel("How to pay").fill("UPI manali@agency");
  await payments.getByRole("button", { name: "Save", exact: true }).click();
  await expect(owner.getByText("Payment details saved")).toBeVisible();
  await owner
    .getByTestId("package-qr-input")
    .setInputFiles({ name: "pay-qr.png", mimeType: "image/png", buffer: PIXEL });
  await expect(payments.getByRole("link", { name: "pay-qr.png" })).toBeVisible();
  // The departure of 12 Dec is made for the journey, as a copy of one of the package's own, when no weekday made it.
  const departureId = await inAgency(agency.organizationId, async (tx) => {
    const day = new Date(`${twelfth}T00:00:00Z`);
    const found = await tx.departure.findFirst({ where: { templateId: packageId, startDate: day } });
    if (found !== null) return found.id;
    const model = await tx.departure.findFirstOrThrow({ where: { templateId: packageId } });
    const made = await tx.departure.create({
      data: {
        title: model.title,
        startDate: day,
        endDate: new Date(day.getTime() + 5 * 24 * 60 * 60 * 1000),
        seatsTotal: 20,
        templateId: packageId,
      },
      select: { id: true },
    });
    return made.id;
  });
  const sell = owner.getByRole("switch", { name: "AI can sell this package" });
  await expect(sell).toBeEnabled();
  await sell.click();
  await expect(sell).toBeChecked();

  // Now the switch is accepted.
  await owner.goto("/settings/ai");
  // The form starts from what was saved, and takes it again if the settings load after it: let them settle first.
  await owner.waitForLoadState("networkidle");
  const again = owner.getByRole("switch", { name: "Let the AI answer WhatsApp chats by itself" });
  await expect(again).toBeEnabled();
  await again.click();
  await expect(again).toBeChecked();
  const groundedAgain = owner.getByRole("switch", { name: "Answer from your packages only" });
  await groundedAgain.click();
  await expect(groundedAgain).toBeChecked();
  await expect(again).toBeChecked();
  await owner.getByRole("button", { name: "Save the autopilot" }).click();
  await expect(owner.getByText("Autopilot settings saved")).toBeVisible();
  await owner.reload();
  await expect(owner.getByRole("switch", { name: "Answer from your packages only" })).toBeChecked();
  await expectAccessible(owner);

  // Spiti is not run and custom trips are off: the customer is told so and offered Manali, and the chat is flagged.
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Rahul Mehta", "Do you run Spiti trips? We are 2 people");
  const said = async () => (await sentTo(customer)).map((message) => message.text ?? message.caption ?? "");
  await expect.poll(said, { timeout: 120_000 }).toContainEqual(expect.stringMatching(/don't run Spiti.*Manali/));
  await owner.reload();
  await expect(chat.getByText("The AI flagged: not_run.", { exact: false })).toBeVisible();
  await expect(chat.getByText(/don't run Spiti/)).toBeVisible();
  await expectAccessible(owner);

  // December: the peak season's price, written by code.
  const write = async (text: string) => {
    expect(
      await deliverWhatsapp([customerMessage({ to: business, customerNumber: customer, name: "Rahul Mehta", text })]),
    ).toBe(200);
  };
  await write("Manali double sharing in December, the 12 Dec batch, what is the price?");
  await expect.poll(said, { timeout: 120_000 }).toContainEqual(expect.stringContaining("₹9,999"));

  // A reply that types ₹7,999 twice is never sent: nothing new reaches the customer, and the team is told.
  const sentBefore = (await said()).length;
  await write("Can you do Manali on 12 Dec for 2 people cheaper? What is the price?");
  await expect
    .poll(() => inAgency(agency.organizationId, async (tx) => (await tx.aiChat.findFirst())?.attentionReason ?? ""), {
      timeout: 120_000,
    })
    .toContain("(amount)");
  expect(await said()).toHaveLength(sentBefore);
  await owner.reload();
  await expect(chat.getByText("could not answer safely (amount)", { exact: false })).toBeVisible();
  await expect(chat.getByText(/7,999/)).toHaveCount(0);

  // "Book": the QR and the payment words with the advance for two, the seats held, and the booking waits on a person.
  await write("Book Manali for 2, double sharing, 12 Dec");
  await expect.poll(said, { timeout: 120_000 }).toContainEqual(expect.stringContaining("₹4,000"));
  // The reply is first; the payment words and the QR follow as messages of their own.
  await expect.poll(said, { timeout: 60_000 }).toContainEqual(expect.stringContaining("UPI manali@agency"));
  await expect
    .poll(async () => (await sentTo(customer)).some((message) => message.contentType === "image"), { timeout: 60_000 })
    .toBe(true);
  const everything = (await said()).join("\n");
  expect(everything).toContain("₹19,998");
  expect(everything).not.toContain("7,999");

  await owner.goto(`/departures/${departureId}`);
  const held = owner.getByRole("region", { name: "Held seats" });
  await expect(held).toContainText("Rahul Mehta");
  await expect(held).toContainText("2 seats");
  // The customer pays and sends the screenshot: only then does the booking wait for a person on Payments to check.
  const photoUrl = process.env.E2E_MSG91_PHOTO_URL;
  if (!photoUrl) throw new Error("E2E_MSG91_PHOTO_URL is not set");
  expect(
    await deliverWhatsapp([
      customerMessage({
        to: business,
        customerNumber: customer,
        name: "Rahul Mehta",
        contentType: "image",
        url: photoUrl,
      }),
    ]),
  ).toBe(200);
  await owner.goto("/payments");
  await expect(owner.getByRole("heading", { level: 1, name: "Payments to check" })).toBeVisible();
  const row = owner.getByRole("row", { name: /Rahul Mehta/ });
  await expect(async () => {
    await owner.reload();
    await expect(row).toContainText("Proof sent to the AI", { timeout: 4_000 });
  }).toPass({ timeout: 90_000 });
  await expect(row).toContainText("Expected ₹4,000");
  await expectAccessible(owner);
});
