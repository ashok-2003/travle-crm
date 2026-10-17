// Staff management (spec 6.3): an Owner adds staff with or without email, changes a role, removes someone; the new
// person can sign in with what the Owner hands over; a role without staff:manage sees why the screen isn't there.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";
import { signInWithCode } from "./support/sign-in-with-code";

test("an Owner adds staff without email, who can then sign in with the organization code", async ({
  page,
  browser,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  await form.getByLabel("Full name").fill("Ravi Kumar");
  await form.getByLabel("Username").fill("ravi");
  const password = await form.getByLabel("Temporary password").inputValue();
  await animationsSettled(page);
  await expectAccessible(page);
  await form.getByRole("button", { name: "Add", exact: true }).click();

  const handover = page.getByRole("dialog", { name: "Ravi Kumar was added" });
  await expect(handover.getByText(agency.code, { exact: true })).toBeVisible();
  await expect(handover.getByText(password, { exact: true })).toBeVisible();
  await animationsSettled(page);
  await expectAccessible(page);
  await handover.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Ravi Kumar")).toBeVisible();
  await expect(page.getByText("Must change password")).toBeVisible();

  // Ravi, on his own device, signs in with what the Owner gave him and must choose a new password first.
  const ravisPhone = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "" });
  await signInWithCode(ravisPhone.request, { orgCode: agency.code, username: "ravi", password });
  const me = await ravisPhone.request.get("/api/trpc/me.get");
  expect(((await me.json()) as { result: { data: { pendingStep: string } } }).result.data.pendingStep).toBe(
    "CHANGE_PASSWORD",
  );
  await ravisPhone.close();
});

test("an Owner adds staff with an email", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  const email = `meera-${agency.code.toLowerCase()}@example.test`;
  await form.getByLabel("Full name").fill("Meera Iyer");
  await form.getByLabel("Email").fill(email);
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("dialog", { name: "Meera Iyer was added" }).getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(email)).toBeVisible();
});

test("the form says what to fix before anything is sent", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add staff" });
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form.getByText("Give their full name.")).toBeVisible();
  await expect(form.getByText("Give an email, a username or both.")).toBeVisible();
});

test("a role change shows at once and sticks", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Actions for Ravi Kumar" }).click();
  await page.getByRole("menuitem", { name: "Change role" }).click();
  const dialog = page.getByRole("dialog", { name: "Change Ravi Kumar's role" });
  await dialog.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: "Operations" }).click();
  await dialog.getByRole("button", { name: "Change role" }).click();
  await expect(page.getByText("Ravi Kumar is now Operations")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Operations/).first()).toBeVisible();
  await expect(page.getByText("Sales", { exact: true })).toHaveCount(0);
});

test("a dialog opened from a row's menu gives the focus back to the menu's button", async ({
  page,
  agency,
  addStaff,
}) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  const menu = page.getByRole("button", { name: "Actions for Ravi Kumar" });
  await menu.click();
  await page.getByRole("menuitem", { name: "Change role" }).click();
  const dialog = page.getByRole("dialog", { name: "Change Ravi Kumar's role" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();

  // From the keyboard too: the menu's last item asks first, and Escape puts the focus back where it started.
  await menu.press("Enter");
  await page.getByRole("menuitem", { name: "Change role" }).waitFor();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "Remove" })).toBeFocused();
  await page.keyboard.press("Enter");
  const confirm = page.getByRole("alertdialog", { name: "Remove Ravi Kumar?" });
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(menu).toBeFocused();
});

test("removing someone takes them off the list", async ({ page, agency, addStaff }) => {
  await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByEmail(page, agency.owner);
  await page.goto("/staff");
  await page.getByRole("button", { name: "Actions for Ravi Kumar" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Remove Ravi Kumar?" });
  await animationsSettled(page);
  await expectAccessible(page);
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Ravi Kumar was removed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Actions for Ravi Kumar" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Staff" })).toBeVisible();
  await expect(page.getByText("Ravi Kumar")).toHaveCount(0);
});

test("a salesperson sees why the staff screen isn't there", async ({ page, agency, addStaff }) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInWithCode(page.request, { orgCode: agency.code, username: ravi.username, password: ravi.password });
  await page.goto("/staff");
  await expect(page.getByText("Your role doesn't include this screen.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add staff" })).toHaveCount(0);
});
