// Release 4, journey 4: with a one-minute reply time counted over every hour, a new lead nobody answered tells the Owner
// (everyone who can assign leads) in the bell, and a lead moved out of New in time tells no one.
import { expect, signInByEmail, test } from "./support/fixtures";
import { moveStageThroughApi } from "./support/leads";
import { saveSettings, websiteVisitors } from "./support/assignment";

test("a lead with no reply past the limit alerts the Owner; an answered one does not", async ({
  page,
  request,
  agency,
}) => {
  test.setTimeout(240_000);
  await signInByEmail(page, agency.owner);
  await saveSettings(page, { slowReplyMinutes: 1 });
  const visitors = await websiteVisitors(page, request);
  const ignored = await visitors.enquire({ name: "Meera Pillai" });
  const answered = await visitors.enquire({ name: "Dev Kapoor" });
  expect(ignored.stage).toBe("new");
  await moveStageThroughApi(page, answered.id, "contacted");

  await page.goto("/today");
  const bell = page.getByRole("button", { name: /^Notifications/ }).filter({ visible: true });
  await expect(async () => {
    await page.reload();
    await expect(bell).toHaveAccessibleName(/Notifications, \d+ unread/);
    await bell.click();
    await expect(
      page.getByRole("dialog", { name: "Notifications" }).getByText("A new lead is waiting for a reply"),
    ).toBeVisible();
  }).toPass({ timeout: 180_000, intervals: [5_000] });
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText("Meera Pillai")).toBeVisible();
  await expect(panel.getByText("Dev Kapoor")).toHaveCount(0);
});
