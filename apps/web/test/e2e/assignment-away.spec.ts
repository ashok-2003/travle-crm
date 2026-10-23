// Release 4, journey 2: with Priya and Ravi in the pool, Priya goes away for 3 days on her own Today and the next
// enquiry goes to Ravi; with Ravi away too the one after lands in Unassigned, the Owner is told and sees the count on the
// tab, and reassigns it from the queue.
import { expect, signInByCode, signInByEmail, test } from "./support/fixtures";
import { callApi, anotherPersonsDevice } from "./support/leads";
import { salesTeam, saveSettings, websiteVisitors } from "./support/assignment";

test("away skips Priya, then Ravi; the lead waits in Unassigned and the Owner reassigns it", async ({
  page,
  browser,
  request,
  agency,
  addStaff,
}) => {
  await signInByEmail(page, agency.owner);
  const team = await salesTeam(page, agency, addStaff);
  await saveSettings(page, { mode: "turns", pool: [team.priya.userId, team.ravi.userId] });
  const visitors = await websiteVisitors(page, request);

  // Priya marks herself away from her own Today.
  const priyasPhone = await anotherPersonsDevice(browser);
  const priyasPage = await priyasPhone.newPage();
  await signInByCode(priyasPage, { code: agency.code, staff: team.priya });
  await priyasPage.goto("/today");
  await expect(priyasPage.getByText("New leads in turn")).toBeVisible();
  await priyasPage.getByRole("button", { name: "Away for 3 days" }).click();
  await expect(priyasPage.getByText(/You're away until/)).toBeVisible();
  const toRavi = await visitors.enquire({ name: "Meera Pillai" });
  expect(toRavi.ownerUserId).toBe(team.ravi.userId);

  // Ravi goes away too.
  const ravisPhone = await anotherPersonsDevice(browser);
  const ravisPage = await ravisPhone.newPage();
  await signInByCode(ravisPage, { code: agency.code, staff: team.ravi });
  await callApi(ravisPage, "assignment.setAway", { awayUntil: new Date(Date.now() + 3 * 86_400_000).toISOString() });
  const waiting = await visitors.enquire({ name: "Dev Kapoor" });
  expect(waiting.ownerUserId).toBeNull();

  // The Owner is told, sees the count, and works the queue.
  await page.goto("/leads");
  await expect(page.getByRole("tab", { name: "Unassigned (1)" })).toBeVisible();
  const bell = page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true });
  await expect(async () => {
    await page.reload();
    await expect(bell).toHaveAccessibleName(/Notifications, \d+ unread/);
  }).toPass({ timeout: 20_000 });
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText("A new lead has no owner")).toBeVisible();
  await expect(panel.getByText("Dev Kapoor")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("tab", { name: "Unassigned (1)" }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: /Dev Kapoor/ })
    .click();
  await expect(page.getByRole("list", { name: "Timeline" }).getByText("Nobody could take it")).toBeVisible();
  await page.getByRole("region", { name: "Owner and source" }).getByRole("button", { name: "Reassign" }).click();
  const dialog = page.getByRole("dialog", { name: "Reassign" });
  await dialog.getByRole("combobox", { name: "Owner" }).click();
  await page.getByRole("option", { name: "Priya Nair" }).click();
  await dialog.getByRole("button", { name: "Reassign" }).click();
  await expect(page.getByText("Reassigned to Priya Nair")).toBeVisible();
  await page.goto("/leads");
  await expect(page.getByRole("tab", { name: "Unassigned" })).toBeVisible();
  await priyasPhone.close();
  await ravisPhone.close();
});
