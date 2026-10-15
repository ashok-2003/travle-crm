// The app shell: a signed-in member lands in their organization with the navigation their role allows, every page
// carries the security headers, and signing out leaves no organization data on the device.
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";

test("an Owner sees their organization and every destination", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  for (const destination of testInfo.project.name === "phone"
    ? ["Home", "Staff", "Roles", "Settings", "More"]
    : ["Home", "Staff", "Roles", "Settings"]) {
    await expect(
      navigation.getByRole(testInfo.project.name === "phone" && destination === "More" ? "button" : "link", {
        name: destination,
      }),
    ).toBeVisible();
  }
  await expectAccessible(page);
});

test("a salesperson sees only what their role allows", async ({ page, addStaff, agency }) => {
  const ravi = await addStaff({ name: "Ravi Kumar", username: "ravi", roleKey: "sales" });
  const response = await page.request.post("/api/auth/sign-in/org", {
    data: { orgCode: agency.code, username: ravi.username, password: ravi.password },
    headers: { origin: process.env.E2E_BASE_URL ?? "" },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Ravi Kumar" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(navigation.getByRole("link", { name: "Home" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Staff" })).toHaveCount(0);
  await expect(page.getByText("Your organization's admins set things up.")).toBeVisible();
});

test("pointing at a destination loads its data before it opens", async ({ page, agency }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "phones have no pointer; touching the link does the same");
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  const staffList = page.waitForRequest((request) => request.url().includes("/api/trpc/staff.list"));
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Staff" }).hover();
  await staffList;
});

test("pages carry the security headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("a signed-out visitor is sent to sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in\?next=%2F$/);
});

test("signing out wipes the saved data and ends the session", async ({ page, agency }, testInfo) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // The query cache saves itself to IndexedDB within a second of changing.
  await expect.poll(() => page.evaluate(savedQueries)).toBeGreaterThan(0);
  if (testInfo.project.name === "phone") await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await page.evaluate(savedQueries)).toBe(0);
  const me = await page.request.get("/api/trpc/me.get");
  expect(me.status()).toBe(401);
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
