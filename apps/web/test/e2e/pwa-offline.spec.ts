// The offline shell (spec 11, DESIGN.md: an offline shell and cached last-viewed screens): once the service worker
// controls the app, a screen opened before still opens without a connection, from the saved page and the saved query
// cache, under the offline banner; an address never opened shows the offline page.
import type { Page } from "@playwright/test";
import { expect, signInByEmail, test } from "./support/fixtures";

/** Waits for the service worker to be active and to control this page (a reload gives it control). */
async function controlledByServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

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

test("the service worker registers and controls the app", async ({ page }) => {
  await page.goto("/offline");
  await controlledByServiceWorker(page);
  const response = await page.request.get("/sw.js");
  expect(response.headers()["cache-control"]).toBe("no-cache");
  expect(response.headers()["service-worker-allowed"]).toBe("/");
});

test("a screen opened before opens offline, with its data and the offline banner", async ({
  page,
  context,
  agency,
}) => {
  await signInByEmail(page, agency.owner);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await controlledByServiceWorker(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect.poll(() => page.evaluate(savedQueries)).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: `Welcome, ${agency.owner.name}` })).toBeVisible();
  await expect(page.getByText("You're offline. You see what was last loaded")).toBeVisible();
  await context.setOffline(false);
});

test("an address never opened shows the offline page while offline", async ({ page, context }) => {
  await page.goto("/offline");
  await controlledByServiceWorker(page);
  await context.setOffline(true);
  await page.goto("/roles");
  await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
  await context.setOffline(false);
});
