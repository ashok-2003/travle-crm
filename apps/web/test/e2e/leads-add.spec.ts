// Adding a lead by hand (spec 3.2, 3.3): an Owner, from an empty Leads, adds a lead with only a name and a phone,
// lands on it (its timeline beside its cards on a computer, under them on a phone), and finds it in Leads again, by name or by part of the phone, typed with spaces; the search is found
// again on the way back from the lead, and no URL the browser asks for, nor any Referer, ever carries it (W1); the
// lists' Tabs, chips and table pass axe, and a phone's chip row scrolls sideways without the page itself doing so.
import type { Page } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";
import { animationsSettled } from "./support/settled";

/** Waits for the list's answer to a search: the text travels in the request's body, never its URL. */
function searchAnswered(page: Page, text: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/api/trpc/") &&
      response.url().includes("leads.list") &&
      (response.request().postData() ?? "").includes(JSON.stringify(text)),
  );
}

test("an Owner adds a lead with a name and a phone, and finds it in Leads", async ({ page, agency }, testInfo) => {
  // Every address the browser asks for, and every Referer it sends: pages, Next's own fetches, the api's calls.
  const addresses: string[] = [];
  page.on("request", (request) => {
    addresses.push(request.url(), request.headers().referer ?? "");
  });
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
  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Lead added from a phone call")).toBeVisible();
  await expectAccessible(page);
  // A computer (1280px here) has room beside the lead's cards: the timeline sits there, level with the top of their
  // column (Follow-ups, with no AI card above it), and its entries scroll in their own box. A phone reads it under the
  // trip, and keeps Call, WhatsApp and Note in a bar at the screen's foot.
  const followUps = await page.getByRole("region", { name: "Follow-ups" }).boundingBox();
  const trip = await page.getByRole("region", { name: "Trip" }).boundingBox();
  const history = await page.getByRole("region", { name: "Timeline" }).boundingBox();
  if (followUps === null || trip === null || history === null) throw new Error("The lead's cards aren't on the page.");
  const bar = page.getByRole("group", { name: "Reach Rahul Sharma" });
  if (testInfo.project.name === "phone") {
    expect(history.y).toBeGreaterThan(trip.y + trip.height);
    await expect(bar).toBeInViewport();
  } else {
    expect(history.x).toBeGreaterThanOrEqual(followUps.x + followUps.width);
    expect(Math.abs(history.y - followUps.y)).toBeLessThan(1);
    await expect(page.getByRole("region", { name: "What happened, newest first" })).toBeVisible();
    await expect(bar).toHaveCount(0);
  }
  // No sideways scroll at either width.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );

  await page.getByRole("main").getByRole("link", { name: "Leads", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Leads" })).toBeVisible();
  const lead = page.getByRole("main").getByRole("link", { name: /Rahul Sharma/ });
  await expect(lead).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Open/ })).toHaveAttribute("aria-checked", "true");

  const search = page.getByRole("searchbox", { name: "Search leads by name or phone" });
  const byPhone = searchAnswered(page, "43 210");
  await search.fill("43 210");
  await byPhone;
  await expect(lead).toBeVisible();
  const byName = searchAnswered(page, "Rahul Shrma");
  await search.fill("Rahul Shrma");
  await byName;
  await expect(lead).toBeVisible();
  await expect(page).toHaveURL(/\/leads$/);

  // Back from the lead, the list has its search again.
  await lead.click();
  await expect(page.getByRole("heading", { level: 1, name: "Rahul Sharma" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Leads", exact: true }).click();
  await expect(search).toHaveValue("Rahul Shrma");
  await expect(lead).toBeVisible();

  await search.fill("Meera");
  // Said in the list's place, and to screen readers in the list's status.
  await expect(page.locator("[data-slot=empty]").getByText("No results for these filters")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "No results for these filters" })).toBeAttached();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/leads$/);
  await expect(lead).toBeVisible();
  await expect(search).toHaveValue("");
  const searched = /43(\+|%20| )210|shrma|meera/i;
  expect(addresses.filter((address) => searched.test(address))).toEqual([]);

  if (testInfo.project.name === "phone") {
    // The chips scroll sideways in their own row (R42): the last, Booking requested, starts past the screen's edge,
    // and scrolls into view; Filters sits beside the search, in view; the page itself never scrolls sideways.
    const width = page.viewportSize()?.width ?? 0;
    const filters = await page.getByRole("button", { name: "Filters" }).boundingBox();
    expect((filters?.x ?? width) + (filters?.width ?? 0)).toBeLessThanOrEqual(width);
    const last = page.getByRole("radio", { name: /^Booking requested/ });
    const before = await last.boundingBox();
    expect((before?.x ?? 0) + (before?.width ?? 0)).toBeGreaterThan(width);
    await last.scrollIntoViewIfNeeded();
    const after = await last.boundingBox();
    expect((after?.x ?? width) + (after?.width ?? 0)).toBeLessThanOrEqual(width);
    const pageScrolls = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(pageScrolls).toBe(false);
  }
  await animationsSettled(page);
});
