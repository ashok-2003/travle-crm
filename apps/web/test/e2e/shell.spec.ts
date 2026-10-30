// The app shell: a signed-in member lands in their organization with the navigation their role allows (Home, Today and
// Leads for Sales, without the setup card; an Owner's phone bar is Home, Today, Leads, Staff and More), every page
// carries the security headers, and signing out leaves no organization data on the device, offline too. Each journey's
// last screen also gets the automatic accessibility check (support/accessible-after-each.ts).
import type { Page, TestInfo } from "@playwright/test";
import { expect, homeGreeting, signInByCode, signInByEmail, signOutOf, test } from "./support/fixtures";

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

test("an Owner sees their organization and every destination", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: homeGreeting(agency.owner.name) })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  for (const destination of isPhone(testInfo)
    ? ["Home", "Today", "Leads", "Follow-ups", "More"]
    : ["Home", "Today", "Leads", "Staff", "Roles", "Settings", "Audit log"]) {
    await expect(
      navigation.getByRole(isPhone(testInfo) && destination === "More" ? "button" : "link", { name: destination }),
    ).toBeVisible();
  }
});

test("a salesperson sees only what their role allows", async ({ page, addStaff, agency }) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  await signInByCode(page, { code: agency.code, staff: ravi });
  const setupAsked: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("organization.setup.get")) setupAsked.push(request.url());
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: homeGreeting("Ravi Kumar") })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  for (const destination of ["Home", "Today", "Leads"]) {
    await expect(navigation.getByRole("link", { name: destination })).toBeVisible();
  }
  await expect(navigation.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Today at a glance" })).toBeVisible();
  // The setup card is for those who may change the settings: Sales never even asks for it.
  await page.waitForLoadState("networkidle");
  expect(setupAsked).toEqual([]);
  await expect(page.getByRole("region", { name: /^Finish setting up/ })).toHaveCount(0);
});

test("the phone's More sheet holds the account and sign-out", async ({ page, agency }, testInfo) => {
  test.skip(!isPhone(testInfo), "the More sheet is the phone's; desktops show the sidebar");
  await signInByEmail(page, agency.owner);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog", { name: agency.name });
  await expect(sheet.getByRole("link", { name: "Your account" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
  // The journey ends with the sheet open, so the accessibility check judges it.
});

test("pointing at a destination loads its data before it opens", async ({ page, agency }, testInfo) => {
  test.skip(isPhone(testInfo), "phones have no pointer; touching the link does the same");
  await signInByEmail(page, agency.owner);
  await page.goto("/dashboard");
  const staffList = page.waitForRequest((request) => request.url().includes("/api/trpc/staff.list"));
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Staff" }).hover();
  await staffList;
});

test("on a desktop the sidebar stays put while a long page scrolls", async ({ page, agency }, testInfo) => {
  test.skip(isPhone(testInfo), "phones have the bottom bar, which is fixed already");
  // A short window: the account page is longer than it, and so is the sidebar, whose own content then scrolls.
  await page.setViewportSize({ width: 1280, height: 320 });
  await signInByEmail(page, agency.owner);
  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" });
  const before = await navigation.boundingBox();
  await page.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await navigation.boundingBox()).toEqual(before);
  expect(await page.locator("[data-slot=sidebar-container]").boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 232,
    height: 320,
  });
  await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
});

test("pages carry the security headers, and the token and offline pages send only their origin as referrer", async ({
  page,
}) => {
  const response = await page.goto("/dashboard");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("upgrade-insecure-requests");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
  for (const address of ["/reset-password?token=abc", "/sign-in/two-factor", "/two-factor-setup", "/offline"]) {
    const answer = await page.request.get(address, { maxRedirects: 0 });
    expect(answer.headers()["referrer-policy"], address).toBe("strict-origin");
  }
});

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
});

async function signOutFrom(page: Page, testInfo: TestInfo): Promise<void> {
  await signOutOf(page, { phone: isPhone(testInfo) });
}

test("signing out wipes the saved data and ends the session", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The query cache saves itself to IndexedDB within a second of changing.
  await expect.poll(() => page.evaluate(savedQueries)).toBeGreaterThan(0);
  await signOutFrom(page, testInfo);
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await page.evaluate(savedQueries)).toBe(0);
  // The page left without waiting for the api; the call it sent on the way out (or the sign-in page's) ends the session.
  await expect.poll(async () => (await page.request.get("/api/trpc/me.get")).status()).toBe(401);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("travel-crm.sign-out-owed"))).toBeNull();
});

test("signing out offline wipes at once, and the next page online ends the session first", async ({
  page,
  context,
  agency,
}, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(savedQueries)).toBeGreaterThan(0);
  await context.setOffline(true);
  const leaving = page.waitForRequest((request) => request.isNavigationRequest() && request.url().endsWith("/sign-in"));
  await signOutFrom(page, testInfo);
  await leaving;
  await context.setOffline(false);
  await page.goto("/dashboard");
  // The owed sign-out reached the api before anything asked who is signed in, so the session is gone.
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  expect(await page.evaluate(savedQueries)).toBe(0);
  expect((await page.request.get("/api/trpc/me.get")).status()).toBe(401);
});

/** How many saved query-cache entries IndexedDB holds (runs in the page). */
function savedQueries(): Promise<number> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("travel-crm");
    opening.onerror = () => {
      reject(opening.error ?? new Error("IndexedDB failed"));
    };
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains("query-cache")) {
        database.close();
        resolve(0);
        return;
      }
      const counting = database.transaction("query-cache").objectStore("query-cache").count();
      counting.onsuccess = () => {
        database.close();
        resolve(counting.result);
      };
    };
  });
}
