// The root layout carries only the `common` words; each group brings its own. A page outside every group must still read
// its words: an address no page has, signed out, and the offline page. A missing message would show as a thrown error.
import { expect, test } from "./support/fixtures";

test("a page outside every group has its words: not found, signed out", async ({ page }) => {
  const response = await page.goto("/there-is-no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "This page doesn't exist" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the home screen" })).toBeVisible();
});

test("the offline page has its words", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
