// Push (spec 9.4), as far as Chromium goes without a push service: turning push on asks the browser and saves its
// subscription to the api; signing out removes it from the api and from the browser before the session ends, so a
// shared phone gets no more of this person's pushes. The journeys' Chromium has no push service (a headless browser
// reports notifications denied, and its push manager can't register), so the page's permission and push manager are
// stand-ins (standInPush). Unverified here: a real push service's subscription and delivery, the browser's own
// prompt, and showing a push and its tap (the worker's tests cover those two: test/pwa/push-worker.test.ts).
import type { Page, TestInfo } from "@playwright/test";
import { signInByEmail } from "./support/fixtures";
import { expect, test } from "./support/notifications";

/**
 * Runs in the page before the app: notifications allowed, and a push manager that hands out one subscription on a
 * known push service and records in sessionStorage (which outlives the sign-out's page load) that it was removed.
 */
function standInPush(): void {
  const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${crypto.randomUUID()}`;
  const keys = { p256dh: `B${"A".repeat(86)}`, auth: "A".repeat(22) };
  let current: object | null = null;
  const subscription = {
    endpoint,
    expirationTime: null,
    toJSON: () => ({ endpoint, expirationTime: null, keys }),
    unsubscribe: () => {
      current = null;
      sessionStorage.setItem("e2e-push-removed", endpoint);
      return Promise.resolve(true);
    },
  };
  Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
  Notification.requestPermission = () => Promise.resolve("granted");
  PushManager.prototype.subscribe = function subscribe() {
    current = subscription;
    sessionStorage.setItem("e2e-push-subscribed", endpoint);
    return Promise.resolve(subscription as unknown as PushSubscription);
  };
  PushManager.prototype.getSubscription = function getSubscription() {
    return Promise.resolve(current as PushSubscription | null);
  };
}

const isPhone = (testInfo: TestInfo) => testInfo.project.name === "phone";

async function signOutFrom(page: Page, testInfo: TestInfo): Promise<void> {
  if (isPhone(testInfo)) await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).click();
}

test("turning push on saves this browser, and signing out removes it first", async ({
  page,
  agency,
  ownerPushEndpoints,
}, testInfo) => {
  await page.addInitScript(standInPush);
  await signInByEmail(page, agency.owner);
  await page.goto("/account/notifications");
  // A browser subscribes through the service worker, which the app registers on its first page.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

  const device = page.getByRole("region", { name: "On this device" });
  await expect(device.getByText("Off", { exact: true })).toBeVisible();
  await device.getByRole("button", { name: "Turn on push" }).click();
  await expect(device.getByText("On", { exact: true })).toBeVisible();
  await expect(device.getByRole("button", { name: "Turn off push" })).toBeVisible();
  const endpoint = await page.evaluate(() => sessionStorage.getItem("e2e-push-subscribed"));
  expect(await ownerPushEndpoints()).toEqual([endpoint]);

  await signOutFrom(page, testInfo);
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(await ownerPushEndpoints()).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("e2e-push-removed"))).toBe(endpoint);
});

test("turning push off removes this browser from the api", async ({ page, agency, ownerPushEndpoints }) => {
  await page.addInitScript(standInPush);
  await signInByEmail(page, agency.owner);
  await page.goto("/account/notifications");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  const device = page.getByRole("region", { name: "On this device" });
  await device.getByRole("button", { name: "Turn on push" }).click();
  await expect.poll(ownerPushEndpoints).toHaveLength(1);
  await device.getByRole("button", { name: "Turn off push" }).click();
  await expect(device.getByRole("button", { name: "Turn on push" })).toBeVisible();
  expect(await ownerPushEndpoints()).toEqual([]);
});
