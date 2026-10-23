// Connecting a Facebook Page (spec 3.2, 3.4, 12): an Owner opens Facebook's dialog from Connect a Page, comes back to the
// callback with a code that is gone from the address at once, ticks the Page, and has it connected; the Page's forms are
// listed, and bringing one in matches its questions as guessed and leaves it brought in.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { aFacebookPage, bringInForm, connectFacebookPage, fakeMeta } from "./support/meta";

test("an Owner connects a Page through Facebook's dialog and brings a lead form in", async ({ page, agency }) => {
  test.setTimeout(180_000);
  const meta = fakeMeta();
  const facebook = await aFacebookPage(meta);
  await signInByEmail(page, agency.owner);

  // Lead sources names the group, with no Page yet, and Connect a Page leads to the first step.
  await page.goto("/settings/lead-sources");
  await expect(page.getByRole("heading", { level: 2, name: "Facebook and Instagram lead ads" })).toBeVisible();
  await expect(page.getByText("No Page is connected.")).toBeVisible();
  await page.getByRole("link", { name: "Connect a Page" }).click();
  await expect(page.getByText("We never post, message or change anything on your Page.")).toBeVisible();
  await expectAccessible(page);

  await connectFacebookPage(page, facebook);
  expect(await meta.subscribedPages()).toContain(facebook.pageId);
  await expect(page.getByText("Running", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Lead forms on this Page")).toContainText(facebook.formName);
  await expect(page.getByLabel("Lead forms on this Page")).toContainText("Not brought in");
  await expectAccessible(page);

  // The questions are matched for the person: the name and phone by Facebook's own types, the custom one by its wording.
  await page.getByRole("link", { name: `Bring in ${facebook.formName}` }).click();
  await expect(page.getByRole("combobox", { name: "What Full name holds" })).toContainText("Name");
  await expect(page.getByRole("combobox", { name: "What Phone number holds" })).toContainText("Phone");
  await expect(page.getByRole("combobox", { name: "What Where do you want to go? holds" })).toContainText(
    "Destination",
  );
  await expectAccessible(page);
  await page.goto(`/settings/lead-sources`);
  await page.getByRole("link", { name: facebook.pageName }).click();
  await bringInForm(page, facebook.formName);
  await expect(page.getByLabel("Lead forms on this Page")).toContainText("Brought in");

  // The list now counts it.
  await page.goto("/settings/lead-sources");
  const item = page.getByRole("listitem").filter({ hasText: facebook.pageName });
  await expect(item).toContainText("1 form brought in");
});
