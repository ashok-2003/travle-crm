// Adding a lead by hand (spec 3.2, 3.3): an Owner, from an empty Leads, adds a lead with only a name and a phone,
// lands on it, and finds it in Leads again, by name or by part of the phone, typed with spaces; the lists' Tabs, chips
// and table pass axe, and a phone's chip row scrolls sideways without the page itself scrolling sideways.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";

test("an Owner adds a lead with a name and a phone, and finds it in Leads", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/leads");
  await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
  await expect(page.getByText("No open leads yet. Add one when someone asks about a trip.")).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Whose leads" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("main").getByRole("link", { name: "New lead" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "New lead" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Rahul Sharma");
  await page.getByLabel("Phone", { exact: true }).fill("98765 43210");
  await expectAccessible(page);
  await page.getByRole("button", { name: "Save lead" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await expect(page.getByText("+91 98765 43210").first()).toBeVisible();
  const timeline = page.getByRole("list", { name: "Timeline" });
  await expect(timeline.getByText("Lead added from a phone call")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("main").getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
  const lead = page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ });
  await expect(lead).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Open/ })).toHaveAttribute("aria-checked", "true");

  const search = page.getByRole("searchbox", { name: "Search leads by name or phone" });
  await search.fill("43 210");
  await expect(page).toHaveURL(/q=43\+210/);
  await expect(lead).toBeVisible();
  await search.fill("Rahul Shrma");
  await expect(page).toHaveURL(/q=Rahul\+Shrma/);
  await expect(lead).toBeVisible();
  await search.fill("Meera");
  await expect(page.getByText("No results for these filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(lead).toBeVisible();

  if (testInfo.project.name === "phone") {
    // The chips scroll sideways in their own row (R42); the page itself never does.
    const chips = page.getByRole("radiogroup", { name: "Show" });
    const row = chips.locator("..");
    const overflow = await row.evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflow).toBe(true);
    const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(pageScrolls).toBe(false);
  }
  await animationsSettled(page);
});
