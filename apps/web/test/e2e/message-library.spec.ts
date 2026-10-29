// The message library (release 5, scope 3.5): the agency's one set of messages, with the blanks filled in for a lead
// from its page: the customer's name, where they want to go, and the amount and link of its latest quote. The quote's
// link is made when the message is copied. Needs no WhatsApp: it works from the lead's page.
import { expect, test } from "./support/notifications";
import { signInByEmail } from "./support/fixtures";
import { addLeadThroughApi, leadInput } from "./support/leads";

test("a message from the library reads with the lead's blanks filled in, and copies with the quote's link", async ({
  page,
  agency,
  organizationData,
}) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await signInByEmail(page, agency.owner);
  const leadId = await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Kashmir" } } }));
  await organizationData.forOrg(agency.organizationId, async (tx) => {
    await tx.inboxQuickReply.create({
      data: {
        shortcut: "pay",
        title: "Ask for the advance",
        body: "Hi {name}, for {destination} please pay {amount} here: {link}",
      },
    });
    await tx.quote.create({
      data: { leadId, title: "Kashmir 6 days", status: "sent", subtotalPaise: 4_000_000, totalPaise: 4_000_000 },
    });
  });

  await page.goto(`/leads/${leadId}`);
  await page.getByRole("button", { name: "Messages" }).click();
  const dialog = page.getByRole("dialog", { name: "Messages" });
  await dialog.getByRole("radio", { name: "Ask for the advance" }).check();
  await expect(dialog.getByText(/^Hi Rahul, for Kashmir please pay ₹40,000\.00 here: \{link\}/)).toBeVisible();
  await expect(dialog.getByText("The quote's link is made when you copy or open it.")).toBeVisible();

  await dialog.getByRole("button", { name: "Copy the message" }).click();
  await expect(page.getByText("Message copied")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Hi Rahul, for Kashmir please pay ₹40,000\.00 here: https?:\/\/\S+\/p\/\S+$/);
  expect(
    await organizationData.forOrg(agency.organizationId, (tx) =>
      tx.shareLink.count({ where: { recordType: "quote" } }),
    ),
  ).toBe(1);
});
