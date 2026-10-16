// The bell (spec 9.4): a customer opens a quotation the Owner shared, the worker tells the Owner, and the Owner's bell
// shows it with the unread count until it is marked read. The Owner chooses from their account that link opens no
// longer reach them by email, and the choice stays.
import { signInByEmail } from "./support/fixtures";
import { expect, test } from "./support/notifications";

test("a customer opens a shared link, and the sharer's bell says so until it is read", async ({
  page,
  request,
  agency,
  shareAsOwner,
  ownerUnread,
}) => {
  // Issuing, rendering the PDF and the worker's notice each take a moment.
  test.slow();
  const shared = await shareAsOwner();
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  const bell = page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true });
  await expect(bell).toHaveAccessibleName("Notifications");

  // The customer is signed in nowhere: the link redirects to the PDF, and the open is recorded.
  const opened = await request.get(shared.path, { maxRedirects: 0 });
  expect(opened.status()).toBe(302);
  // The open goes out as an event; the worker's listener tells the sharer.
  await expect.poll(ownerUnread, { timeout: 30_000 }).toBe(1);

  await page.reload();
  await expect(bell).toHaveAccessibleName("Notifications, 1 unread");
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText(`Opened: ${shared.label}`)).toBeVisible();
  await expect(panel.getByText("The link you shared has just been opened.")).toBeVisible();
  await panel.getByRole("button", { name: "Mark all read" }).click();
  await expect(panel.getByRole("button", { name: "Mark all read" })).toHaveCount(0);
  await expect.poll(ownerUnread).toBe(0);
  // The phone's sheet hides the page from assistive technology while it is open, the bell with it.
  await page.keyboard.press("Escape");
  await expect(bell).toHaveAccessibleName("Notifications");
  // The journey ends with the list open again, so the accessibility check judges it.
  await bell.click();
  await expect(panel.getByText(`Opened: ${shared.label}`)).toBeVisible();
});

test("an Owner turns off email for opened links, and the choice stays", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/account");
  await page.getByRole("link", { name: "Choose what reaches you" }).click();
  await expect(page).toHaveURL(/\/account\/notifications$/);
  await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();

  const opens = page.getByRole("group", { name: "A customer opens a link you shared" });
  const email = opens.getByRole("switch", { name: "Email" });
  await expect(email).toBeChecked();
  const saved = page.waitForResponse((response) => response.url().includes("notifications.preferences.set"));
  await email.click();
  expect((await saved).ok()).toBe(true);
  await expect(email).not.toBeChecked();

  await page.reload();
  await expect(opens.getByRole("switch", { name: "Email" })).not.toBeChecked();
  await expect(opens.getByRole("switch", { name: "Push" })).toBeChecked();
});
