// Release 5's two things (scope 3.3, 4.4), against the real api: a quote the customer opened over a day ago and then
// went quiet on, which Home's hot leads now carry as a reason (it is no longer a My tasks section), and a payment of an
// accepted quote that is missed, which stays on My tasks.
import { expect, test } from "./support/notifications";
import { signInByEmail } from "./support/fixtures";
import { addLeadThroughApi, dayInIndia, leadInput } from "./support/leads";
import { opened } from "./support/sections";

const DAY = 24 * 3_600_000;

test("Home shows a quote opened with no reply as a hot lead, and My tasks a payment missed", async ({
  page,
  agency,
  organizationData,
}) => {
  await signInByEmail(page, agency.owner);
  const sunita = await addLeadThroughApi(page, leadInput({ person: { name: "Sunita Rao", phone: "+919845012345" } }));
  const kiran = await addLeadThroughApi(page, leadInput({ person: { name: "Kiran Joshi", phone: "+919845067890" } }));
  await organizationData.forOrg(agency.organizationId, async (tx) => {
    const sent = await tx.quote.create({
      data: {
        leadId: sunita,
        title: "Goa 5 days",
        status: "sent",
        subtotalPaise: 3_000_000,
        totalPaise: 3_000_000,
        updatedAt: new Date(Date.now() - 4 * DAY),
      },
      select: { id: true },
    });
    expect(sent.id).toBeTruthy();
    for (const hours of [50, 60]) {
      await tx.leadSignal.create({
        data: {
          leadId: sunita,
          kind: "quote_opened",
          sourceKey: crypto.randomUUID(),
          at: new Date(Date.now() - hours * 3_600_000),
        },
      });
    }
    const accepted = await tx.quote.create({
      data: {
        leadId: kiran,
        title: "Kerala 7 days",
        status: "accepted",
        subtotalPaise: 5_000_000,
        totalPaise: 5_000_000,
      },
      select: { id: true },
    });
    await tx.quoteInstallment.create({
      data: {
        quoteId: accepted.id,
        label: "Advance",
        amountPaise: 2_500_000,
        dueOn: new Date(`${dayInIndia(-1)}T00:00:00Z`),
      },
    });
  });

  await page.goto("/today");
  const payments = page.getByRole("region", { name: "Payments due" });
  await opened(payments, "Payments due");
  await expect(payments.getByRole("link", { name: "Kiran Joshi", exact: true })).toBeVisible();
  await expect(payments.getByText(/^₹25,000 was due \d+ \w+/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Quote opened, no reply" })).toBeHidden();

  await page.goto("/dashboard");
  const hot = page.getByRole("region", { name: "Hot leads to call" });
  await expect(hot.getByText("Sunita Rao")).toBeVisible();
  await expect(hot.getByText("Opened the quote")).toBeVisible();
});
