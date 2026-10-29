// The visual audit of release 5 (2026-10-29): the call panel and its QR (a phone sees the page Send to my phone opens),
// the call note, a lead's timeline with a call, Messages with a message's blanks filled, Today with a payment due and a
// quote opened with no reply, and the morning summary in the notification choices.
import { expect, test } from "../support/notifications";
import { signInByEmail } from "../support/fixtures";
import { addLeadThroughApi, dayInIndia, leadInput } from "../support/leads";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);

const DAY = 24 * 3_600_000;

test("calling, the library, Today's new sections and the morning summary", async ({
  page,
  agency,
  organizationData,
}, testInfo) => {
  test.setTimeout(240_000);
  const phone = testInfo.project.name === "phone";
  await signInByEmail(page, agency.owner);
  const rahul = await addLeadThroughApi(page, leadInput({ trip: { destination: { kind: "new", name: "Kashmir" } } }));
  const sunita = await addLeadThroughApi(page, leadInput({ person: { name: "Sunita Rao", phone: "+919845012345" } }));
  const kiran = await addLeadThroughApi(page, leadInput({ person: { name: "Kiran Joshi", phone: "+919845067890" } }));
  await organizationData.forOrg(agency.organizationId, async (tx) => {
    await tx.inboxQuickReply.create({
      data: {
        shortcut: "pay",
        title: "Ask for the advance",
        body: "Hi {name}, for {destination} please pay {amount} here: {link}",
      },
    });
    await tx.quote.create({
      data: { leadId: rahul, title: "Kashmir 6 days", status: "sent", subtotalPaise: 4_000_000, totalPaise: 4_000_000 },
    });
    await tx.quote.create({
      data: {
        leadId: sunita,
        title: "Goa 5 days",
        status: "sent",
        subtotalPaise: 3_000_000,
        totalPaise: 3_000_000,
        updatedAt: new Date(Date.now() - 4 * DAY),
      },
    });
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

  // The call panel: a computer's popover, or what a phone gets from Send to my phone.
  if (phone) {
    await page.goto(`/call/${rahul}`);
    await expect(page.getByRole("link", { name: "Call Rahul Sharma now" })).toBeVisible();
    await shoot(page, "r5-call-panel");
    // Android dials by itself from that page, so the app asks how the call went on the next screen.
    await page.goto(`/leads/${rahul}`);
  } else {
    await page.goto(`/leads/${rahul}`);
    await page.getByRole("button", { name: "Call Rahul Sharma" }).click();
    const panel = page.getByRole("dialog", { name: "Call Rahul Sharma" });
    await expect(panel.getByRole("img", { name: /QR code/ })).toBeVisible();
    await shoot(page, "r5-call-panel");
    await shoot(page, "r5-call-qr", { element: panel.getByRole("img", { name: /QR code/ }) });
    await panel.getByRole("button", { name: "Log the call" }).click();
  }
  const dialog = page.getByRole("dialog", { name: "How did the call go?" });
  await dialog.getByRole("radio", { name: "No answer" }).check();
  await dialog.getByLabel("Note").fill("Rang twice, try again after lunch");
  await shoot(page, "r5-call-note");
  await dialog.getByRole("button", { name: "Save the call" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("list", { name: "Timeline" }).getByRole("heading", { name: "Call: No answer" }),
  ).toBeVisible();
  await shoot(page, "r5-lead-call-timeline");

  await page.getByRole("button", { name: "Messages" }).click();
  const messages = page.getByRole("dialog", { name: "Messages" });
  await messages.getByRole("radio", { name: "Ask for the advance" }).check();
  await expect(messages.getByText(/please pay ₹40,000/)).toBeVisible();
  await shoot(page, "r5-library");
  await page.keyboard.press("Escape");

  await page.goto("/today");
  await expect(page.getByRole("region", { name: "Payments due" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Quote opened, no reply" })).toBeVisible();
  await shoot(page, "r5-today");

  await page.goto("/account/notifications");
  await expect(page.getByRole("heading", { name: "Morning summary" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "A push each morning with your day" })).toBeVisible();
  await shoot(page, "r5-morning-settings");
});
