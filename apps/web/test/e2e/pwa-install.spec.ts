// The app can be installed (spec 12.1 asks for a PWA check; Lighthouse 12 dropped its PWA category, so these are
// the installability rules browsers apply): every page links the manifest, which names the app, opens it standalone
// at home, and lists icons that load; the favicon and home-screen icon load too.
import { brand } from "@travel-crm/brand";
import { expect, test } from "./support/fixtures";

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

test("the manifest names the app, opens it standalone, and its icons load", async ({ page }) => {
  await page.goto("/sign-in");
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestUrl).toBeTruthy();
  const response = await page.request.get(manifestUrl ?? "");
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Manifest;
  expect(manifest).toMatchObject({
    name: brand.productName,
    short_name: brand.shortName,
    start_url: "/dashboard",
    display: "standalone",
  });
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
    expect(image.headers()["content-type"], icon.src).toBe("image/png");
  }
});

test("pages link a favicon, a home-screen icon and the dark teal theme colour, and they load", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", brand.colours.sidebar.fill);
  const hrefs = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs).toEqual(
    expect.arrayContaining(["/icons/favicon.ico", "/icons/favicon.svg", "/icons/apple-touch-icon.png"]),
  );
  for (const href of hrefs) expect((await page.request.get(href)).status(), href).toBe(200);
});
