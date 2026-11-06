// Payments to check (plan 3 of the WhatsApp sales agent rebuild), on a phone and a desktop, against the real api and the fake
// MSG91: a customer's AI booking with a screenshot in the chat (seeded as the old agent leaves it) and a traveller's "I've paid"
// from the trip page both wait on one list and on Today's count. The owner confirms the AI booking at the prefilled ₹4,000: the
// lead is won, the quote shows ₹4,000 paid and the customer's chat gets the agency's confirmation. The owner marks the claim
// not received: the traveller's chat gets the not-found text. Only a person decides; nothing here is sent by the AI.
import { expectAccessible } from "./support/accessibility";
import { acceptOnTheLink, bookingOf } from "./support/bookings";
import { saveBusinessProfile } from "./support/documents";
import { signInToConsole, expect, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import { callApi, dayInIndia } from "./support/leads";
import { connectNumber, inAgency, newCustomerNumber, openNewChat, sentTo } from "./support/whatsapp";

test.use({ actionTimeout: 15_000 });

test("an AI booking's screenshot and a traveller's claim wait on one list; the owner confirms one and refuses the other, and each customer is told", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(420_000);
  // The console runs in a page of its own; the owner uses the test's page, which keeps the device and can be checked by axe.
  const console = await browser.newPage();
  await signInToConsole(console, superAdmin);
  const business = await connectNumber(console, agency.organizationId);
  await console.close();
  const owner = page;
  await signInByEmail(owner, agency.owner);
  await saveBusinessProfile(owner);

  // Two customers write in, and each gets a lead (the worker makes it a moment after the message).
  const asha = newCustomerNumber();
  const meera = newCustomerNumber();
  await openNewChat(owner, business, asha, "Asha Verma", "I want to book Manali for four");
  await openNewChat(owner, business, meera, "Meera Iyer", "Can I get the Spiti quote?");
  const leadOf = async (customer: string) => {
    let found: string | undefined;
    await expect
      .poll(
        async () => {
          found = await inAgency(
            agency.organizationId,
            async (tx) => (await tx.lead.findFirst({ where: { person: { phoneE164: `+${customer}` } } }))?.id,
          );
          return found;
        },
        { timeout: 60_000 },
      )
      .toBeDefined();
    if (found === undefined) throw new Error("no lead");
    return found;
  };
  const ashaLead = await leadOf(asha);
  const meeraLead = await leadOf(meera);

  // Asha: the old agent took her booking and she sent a screenshot of the payment, which waits for a person.
  const ashaBookingId = await inAgency(agency.organizationId, async (tx) => {
    const chat = await tx.whatsappConversation.findFirstOrThrow({ where: { phoneE164: `+${asha}` } });
    const screenshot = await tx.whatsappMessage.create({
      data: {
        conversationId: chat.id,
        direction: "in",
        origin: "customer",
        kind: "image",
        status: "received",
        occurredAt: new Date(),
      },
      select: { id: true },
    });
    const booking = await tx.aiBooking.create({
      data: {
        leadId: ashaLead,
        conversationId: chat.id,
        summary: "Manali 5N for 4",
        details: { package: "Manali 5N", amount: "₹4,000" },
        status: "proof_received",
        proofMessageIds: [screenshot.id],
        expectedPaise: 400_000n,
      },
      select: { id: true },
    });
    return booking.id;
  });

  // Meera: her quote is accepted on its link, the booking confirmed, and she says on the trip page that she paid.
  const quote = await callApi<{ id: string }>(owner, "quotes.create", {
    leadId: meeraLead,
    title: "Spiti in winter",
    startDate: dayInIndia(40),
    adults: 2,
    children: 0,
    days: [{ title: "Arrive in Kaza", description: "Check in and rest" }],
    items: [{ description: "Package per adult", detail: "", quantity: 2, unitPricePaise: 5_000_000 }],
    inclusions: "",
    exclusions: "",
    notes: "",
    taxRateBasisPoints: 0,
    placeOfSupply: null,
  });
  const shared = await callApi<{ path: string }>(owner, "quotes.share", { quoteId: quote.id });
  const link = `${new URL(owner.url()).origin}${shared.path}`;
  await acceptOnTheLink(browser, link, "Meera Iyer");
  const meeraBooking = await bookingOf(owner, "Meera Iyer");
  await callApi(owner, "bookings.confirm", { bookingId: meeraBooking });
  const traveller = await browser.newPage();
  await traveller.goto(link);
  await traveller.getByText("I've paid Advance").click();
  await traveller.getByLabel("UPI reference or transaction number").first().fill("UTR778899");
  await traveller.getByRole("button", { name: "I've paid" }).first().click();
  await expect(traveller.getByText("Thank you, we'll check your payment")).toBeVisible();
  await traveller.close();

  // Today counts both, and leads to the list.
  await owner.goto("/today");
  // Visiting the inbox folded the sidebar on a computer, and a reload keeps it folded; open it as a person would.
  await expect(owner.getByRole("button", { name: /^Notifications/ })).toBeVisible();
  const expand = owner.getByRole("button", { name: "Open the sidebar" });
  if (await expand.isVisible()) {
    await expand.click();
    await expect(owner.getByRole("link", { name: "Payments to check", exact: true })).toBeVisible();
  }
  await expect(owner.getByText("2 payments are waiting for your word")).toBeVisible();
  await expectAccessible(owner);
  await owner.getByRole("link", { name: /Open payments to check/ }).click();
  await expect(owner.getByRole("heading", { level: 1, name: "Payments to check" })).toBeVisible();
  await expect(owner.getByRole("row", { name: /Asha Verma/ })).toContainText("Proof sent to the AI");
  await expect(owner.getByRole("row", { name: /Asha Verma/ })).toContainText("Expected ₹4,000");
  await expect(owner.getByRole("row", { name: /Meera Iyer/ })).toContainText("Says they paid");
  await expect(owner.getByRole("row", { name: /Meera Iyer/ })).toContainText("Reference UTR778899");
  await expectAccessible(owner);

  // Confirming the AI booking: the amount is prefilled with what was expected; the lead is won and the quote shows it paid.
  await owner.getByRole("button", { name: "Confirm Asha Verma's payment" }).click();
  const dialog = owner.getByRole("dialog");
  await expect(dialog.getByLabel("Amount received")).toHaveValue("4,000");
  await expectAccessible(owner);
  await dialog.getByRole("button", { name: "Record the payment" }).click();
  await expect(owner.getByText("Sent on WhatsApp")).toBeVisible();
  await expect(owner.getByRole("row", { name: /Asha Verma/ })).toHaveCount(0);
  const recorded = await inAgency(agency.organizationId, async (tx) => {
    const ai = await tx.aiBooking.findUniqueOrThrow({ where: { id: ashaBookingId } });
    // With no quote of its own the booking makes one, which the booking points to.
    const quoteId = (await tx.booking.findUniqueOrThrow({ where: { id: ai.bookingId ?? "" } })).quoteId;
    return {
      status: ai.status,
      stage: (await tx.lead.findUniqueOrThrow({ where: { id: ashaLead } })).stage,
      paid: (await tx.quotePayment.findMany({ where: { quoteId } })).map((row) => Number(row.amountPaise)),
    };
  });
  expect(recorded).toEqual({ status: "confirmed", stage: "won", paid: [400_000] });
  await expect
    .poll(async () => (await sentTo(asha)).map((message) => message.text ?? ""), { timeout: 60_000 })
    .toContainEqual(
      expect.stringMatching(/Thank you .* We have received ₹4,000\.00 for .* Your booking is confirmed\./),
    );

  // Refusing the claim: nothing is recorded, and the traveller hears the not-found words.
  await owner.getByRole("button", { name: "Meera Iyer's payment not received" }).click();
  const refusal = owner.getByRole("alertdialog").or(owner.getByRole("dialog"));
  await refusal.getByRole("button", { name: "Not received", exact: true }).click();
  await expect(owner.getByText("Sent on WhatsApp")).toBeVisible();
  await expect(owner.getByText(/Nothing to check/)).toBeVisible();
  await expectAccessible(owner);
  await expect
    .poll(async () => (await sentTo(meera)).map((message) => message.text ?? ""), { timeout: 60_000 })
    .toContainEqual(expect.stringMatching(/we could not find your payment of ₹\d/));
  expect(await inAgency(agency.organizationId, (tx) => tx.quotePayment.count({ where: { quoteId: quote.id } }))).toBe(
    0,
  );

  // Today no longer asks.
  await owner.goto("/today");
  await expect(owner.getByText(/payments? (is|are) waiting for your word/)).toHaveCount(0);
});
