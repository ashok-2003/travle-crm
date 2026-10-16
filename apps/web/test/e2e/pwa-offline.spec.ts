// The offline shell (spec 11, DESIGN.md: an offline shell and cached last-viewed lists): once the service worker
// controls the app, every screen opens without a connection, by the app's links or as a page load, opened before or
// not, from the shell the worker kept and the query cache's saved data, under the offline banner. The worker never
// keeps an api answer or a token; an address with no shell shows the offline page.
import type { Page } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { expect, signInByEmail, test } from "./support/fixtures";

/** Waits for the service worker to be active (its install has kept every shell) and to control this page. */
async function controlledByServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

interface SavedCache {
  clientState: { queries: { queryKey: [string[]?, ...unknown[]] }[] };
}

/** The queries the query cache saved to IndexedDB, by name, such as "staff.list" (runs in the page). */
function savedQueryNames(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open("travel-crm");
    opening.onerror = () => {
      reject(opening.error ?? new Error("IndexedDB failed"));
    };
    opening.onsuccess = () => {
      const database = opening.result;
      if (!database.objectStoreNames.contains("query-cache")) {
        database.close();
        resolve([]);
        return;
      }
      const reading = database.transaction("query-cache").objectStore("query-cache").get("queries");
      reading.onsuccess = () => {
        database.close();
        const saved = typeof reading.result === "string" ? (JSON.parse(reading.result) as SavedCache) : null;
        resolve(saved?.clientState.queries.map(({ queryKey }) => (queryKey[0] ?? []).join(".")) ?? []);
      };
    };
  });
}

interface KeptEntry {
  cache: string;
  url: string;
  contentType: string;
}

/** Everything the service worker kept: the cache, the address and the type of each entry (runs in the page). */
async function keptByWorker(): Promise<KeptEntry[]> {
  const kept: KeptEntry[] = [];
  for (const name of await caches.keys()) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      kept.push({ cache: name, url: request.url, contentType: response?.headers.get("content-type") ?? "" });
    }
  }
  return kept;
}

test("the service worker registers, controls the app and keeps every screen's shell", async ({ page }) => {
  await page.goto("/offline");
  await controlledByServiceWorker(page);
  const response = await page.request.get("/sw.js");
  expect(response.headers()["cache-control"]).toBe("no-cache");
  expect(response.headers()["service-worker-allowed"]).toBe("/");
  const shells = (await page.evaluate(keptByWorker))
    .filter(({ cache }) => cache.startsWith("pages-"))
    .map(({ url }) => new URL(url).pathname);
  expect(shells).toEqual(expect.arrayContaining(["/", "/staff", "/roles", "/settings", "/account", "/offline"]));
  for (const secretPage of ["/reset-password", "/sign-in/two-factor", "/two-factor-setup"]) {
    expect(shells).not.toContain(secretPage);
  }
});

test("screens open offline by the app's links, opened before or not, with their saved data", async ({
  page,
  context,
  agency,
}, testInfo) => {
  // Many page loads, each quick.
  test.slow();
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await controlledByServiceWorker(page);
  const navigation = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  const main = page.getByRole("main");
  const heading = (name: string) => page.getByRole("heading", { level: 1, name });
  const banner = page.getByText("You're offline. You see what was last loaded");
  /** A destination's link: in the sidebar, or the phone's bar, whose first four are Home, Today, Leads and Staff. */
  const open = async (name: string) => {
    if (testInfo.project.name === "phone" && name !== "Staff") {
      await navigation.getByRole("button", { name: "More" }).click();
      await page.getByRole("dialog", { name: agency.name }).getByRole("link", { name }).click();
    } else {
      await navigation.getByRole("link", { name }).click();
    }
  };

  await open("Staff");
  await expect(main.getByText(agency.owner.name, { exact: true })).toBeVisible();
  await open("Roles");
  await expect(main.getByRole("link", { name: /Sales/ })).toBeVisible();
  // The query cache saves itself to IndexedDB within a second of changing.
  await expect
    .poll(() => page.evaluate(savedQueryNames))
    .toEqual(expect.arrayContaining(["me.get", "staff.list", "roles.list"]));

  await context.setOffline(true);
  // Never opened: its shell was kept when the worker installed, and its data comes with me.get.
  await open("Settings");
  await expect(heading("Settings")).toBeVisible();
  await expect(main.getByText(agency.code, { exact: true })).toBeVisible();
  await expect(banner).toBeVisible();
  await open("Staff");
  await expect(heading("Staff")).toBeVisible();
  await expect(main.getByText(agency.owner.name, { exact: true })).toBeVisible();
  await expect(banner).toBeVisible();

  // As page loads, as when the app is opened again without a connection.
  await page.reload();
  await expect(main.getByText(agency.owner.name, { exact: true })).toBeVisible();
  // This page loaded offline, so the router could prefetch nothing: the link's fetch fails, Next loads the page
  // itself (a new document, hence the load event), and the worker answers it from the kept shell.
  const loaded = page.waitForEvent("load");
  await open("Roles");
  await loaded;
  await expect(main.getByRole("link", { name: /Sales/ })).toBeVisible();
  await expect(banner).toBeVisible();
  // A role's page renders per address, so it is never kept: offline it gives way to the roles list.
  await page.goto("/roles/sales");
  await expect(page).toHaveURL(/\/roles$/);
  await expect(heading("Roles")).toBeVisible();
  await expect(heading("You're offline")).toHaveCount(0);
  await context.setOffline(false);
});

test("the worker keeps no api answer and no token, whatever address is opened", async ({ page, agency }) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await controlledByServiceWorker(page);
  // An api answer opened as a page, as another site's link could do, in any case: the rewrite reaches the api.
  for (const address of ["/API/trpc/me.get", "/Api/trpc/staff.list", "/api/trpc/me.get"]) {
    const response = await page.goto(address);
    expect(response?.headers()["content-type"], address).toContain("application/json");
  }
  await page.goto("/reset-password?token=journey-secret-token");
  // A page load the network answers: the worker checks its shells after it.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const kept = await page.evaluate(keptByWorker);
  expect(kept.length).toBeGreaterThan(0);
  for (const { cache, url, contentType } of kept) {
    expect(new URL(url).pathname, url).not.toMatch(/^\/api(\/|$)/i);
    expect(url).not.toContain("token");
    if (cache.startsWith("pages-")) {
      expect(new URL(url).search, url).toBe("");
      expect(contentType, url).toMatch(/^text\/html/);
    }
  }
});

test("an address with no shell shows the offline page, which tries that same address again", async ({
  page,
  context,
}) => {
  await page.goto("/offline");
  await controlledByServiceWorker(page);
  await context.setOffline(true);
  // The two-factor step handles a secret and works only online, so it is never kept.
  await page.goto("/sign-in/two-factor?next=%2Fstaff");
  await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
  const tryAgain = page.getByRole("link", { name: "Try again" });
  expect(await tryAgain.evaluate((link) => (link as HTMLAnchorElement).href)).toBe(page.url());
  for (const link of [tryAgain, page.getByRole("link", { name: "Go to the home screen" })]) {
    expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await expectAccessible(page);
  await context.setOffline(false);
});
