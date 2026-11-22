// The Inbox live (inbox revamp spec, part 1, "Done when"): with a chat open, a customer's next message arrives over the live
// stream within seconds, with no reload and long before the minute's poll, in the chat and in the list beside it; and
// choosing another chat leaves the list where it was.
import { expect, signInToConsole, test } from "./support/console";
import { signInByEmail } from "./support/fixtures";
import {
  connectNumber,
  customerMessage,
  deliverWhatsapp,
  newCustomerNumber,
  openContactDetails,
  openNewChat,
} from "./support/whatsapp";

// Well under the minute's poll: only the live stream can show it in time.
const LIVE_WITHIN_MS = 15_000;

test("a customer's message shows in the open chat within seconds, without a reload", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const other = newCustomerNumber();
  await openNewChat(owner, business, other, "Amit Shah", "Any Ladakh trips in June?");
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Meera Rao", "Is the Goa trip still on?");

  // The page is never loaded again from here on: a reload would count as a fresh page.
  let loads = 0;
  owner.on("load", () => (loads += 1));
  const sentAt = Date.now();
  expect(
    await deliverWhatsapp([
      customerMessage({ to: business, customerNumber: customer, text: "And can we bring our dog along?" }),
    ]),
  ).toBe(200);
  await expect(chat.getByRole("list", { name: "Messages" }).getByText("And can we bring our dog along?")).toBeVisible({
    timeout: LIVE_WITHIN_MS,
  });
  expect(loads).toBe(0);
  // How long the webhook took to reach the screen: the worker's pick-up, the database's notify, the stream, the reload.
  test.info().annotations.push({ type: "shown after", description: `${String(Date.now() - sentAt)} ms` });

  // On a computer the list beside the chat shows it too, and choosing the other chat leaves the list as it was. (On a
  // phone the chat covers the list.)
  const list = owner.getByRole("list", { name: "Chats" });
  if ((owner.viewportSize()?.width ?? 0) >= 768) {
    await expect(list.getByRole("link", { name: /Meera Rao/ })).toContainText("And can we bring our dog along?", {
      timeout: LIVE_WITHIN_MS,
    });
    await list.getByRole("link", { name: /Amit Shah/ }).click();
    await expect(owner.getByRole("region", { name: "Chat with Amit Shah" })).toBeVisible();
    await expect(list.getByRole("link", { name: /Meera Rao/ })).toBeVisible();
    expect(loads).toBe(0);
  }
  await owner.close();
});

test("a customer's message shows in the lead page's chat within seconds, without a reload", async ({
  page,
  browser,
  superAdmin,
  agency,
}) => {
  test.setTimeout(360_000);
  await signInToConsole(page, superAdmin);
  const business = await connectNumber(page, agency.organizationId);
  const owner = await browser.newPage();
  await signInByEmail(owner, agency.owner);
  const customer = newCustomerNumber();
  const chat = await openNewChat(owner, business, customer, "Priya Nair", "Kerala in March?");
  const openLead = owner.getByRole("link", { name: "Open the lead" }).first();
  if (!(await openLead.isVisible())) await openContactDetails(owner, chat);
  await openLead.click();
  const onLead = owner.getByRole("region", { name: "Chat with Priya Nair" });
  await expect(onLead.getByRole("list", { name: "Messages" }).getByText("Kerala in March?")).toBeVisible();

  let loads = 0;
  owner.on("load", () => (loads += 1));
  expect(
    await deliverWhatsapp([
      customerMessage({ to: business, customerNumber: customer, text: "For two adults, please." }),
    ]),
  ).toBe(200);
  await expect(onLead.getByRole("list", { name: "Messages" }).getByText("For two adults, please.")).toBeVisible({
    timeout: LIVE_WITHIN_MS,
  });
  expect(loads).toBe(0);
  await owner.close();
});

test("with the sound on, the app holds one stream for the browser on any page, and another tab takes it over", async ({
  browser,
  agency,
  database,
}) => {
  // The switches are kept for the member signed in.
  const owner = await database.platform.user.findUniqueOrThrow({ where: { email: agency.owner.email } });
  const context = await browser.newContext();
  const streams: string[] = [];
  context.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/live") streams.push(request.url());
  });
  const leads = await context.newPage();
  await signInByEmail(leads, agency.owner);
  await leads.goto("/leads");
  // No alert switched on and no Inbox page: no stream.
  await expect(leads.getByRole("heading", { level: 1 })).toBeVisible();
  await leads.waitForTimeout(1_000);
  expect(streams).toHaveLength(0);
  await leads.evaluate((userId) => {
    window.localStorage.setItem(`travel-crm.inbox.alerts.${userId}.sound`, "on");
  }, owner.id);
  await leads.reload();
  await expect.poll(() => streams.length).toBe(1);

  // A second tab on the Inbox hears the first one's stream rather than opening its own.
  const inbox = await context.newPage();
  await inbox.goto("/inbox");
  await expect(inbox.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  await inbox.waitForTimeout(1_500);
  expect(streams).toHaveLength(1);

  // The tab holding it closes: the other opens the stream.
  await leads.close();
  await expect.poll(() => streams.length).toBe(2);
  await context.close();
});
