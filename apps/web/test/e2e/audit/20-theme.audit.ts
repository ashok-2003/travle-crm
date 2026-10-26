// The visual audit of the theme (2026-10-26, later): Home, Leads, a lead, the inbox with a chat open, Broadcasts, Settings,
// WhatsApp and a console page, to show the product's own look everywhere and WhatsApp's only inside the chat pane.
import { expect, signInToConsole, test } from "../support/console";
import { signInByEmail } from "../support/fixtures";
import { addLeadThroughApi, leadInput } from "../support/leads";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  inAgency,
  newCustomerNumber,
  openNewChat,
} from "../support/whatsapp";
import { screenshotsOnly, shoot } from "./camera";

test.beforeEach(screenshotsOnly);
test.use({ actionTimeout: 30_000 });

test("Theme: home, leads, a lead, the inbox, broadcasts, settings and the console", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(600_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  await page.goto("/console");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(page, "theme-console");

  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  await owner.goto("/dashboard");
  const leadId = await addLeadThroughApi(
    owner,
    leadInput({ person: { name: "Rahul Sharma", phone: "+919876500001" }, trip: { adults: 2 } }),
  );
  await addLeadThroughApi(owner, leadInput({ person: { name: "Meera Iyer", phone: "+919876500002" } }));
  await owner.goto("/dashboard");
  await expect(owner.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot(owner, "theme-home");
  await owner.goto("/leads");
  await expect(owner.getByRole("link", { name: "Rahul Sharma" }).first()).toBeVisible();
  await shoot(owner, "theme-leads");
  await owner.goto(`/leads/${leadId}`);
  await expect(owner.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await shoot(owner, "theme-lead");

  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Anil Kapoor", "Do you have a Kerala package?");
  await deliverWhatsapp([
    customerMessage({ to: business, customerNumber: customer, text: "We are four adults in December." }),
  ]);
  await expect(chat.getByText("We are four adults in December.")).toBeVisible({ timeout: 60_000 });
  await shoot(owner, "theme-inbox-chat");

  await inAgency(agency.organizationId, async (tx) => {
    const connection = await tx.whatsappConnection.findFirstOrThrow({ where: { status: { not: "disconnected" } } });
    const template = await tx.whatsappTemplate.create({
      data: {
        connectionId: connection.id,
        name: "goa_offer",
        language: "en",
        category: "marketing",
        body: "Hi {{1}}",
        status: "approved",
      },
    });
    await tx.whatsappBroadcast.create({
      data: {
        requestId: crypto.randomUUID(),
        templateId: template.id,
        params: ["there"],
        status: "done",
        createdBy: crypto.randomUUID(),
      },
    });
  });
  await owner.goto("/inbox/broadcasts");
  await expect(owner.getByRole("link", { name: /goa_offer/ })).toBeVisible();
  await shoot(owner, "theme-broadcasts");
  await owner.goto("/settings/whatsapp");
  await expect(owner.getByRole("heading", { level: 2, name: "Quick replies" })).toBeVisible();
  await shoot(owner, "theme-settings-whatsapp");
  await owner.close();
});
