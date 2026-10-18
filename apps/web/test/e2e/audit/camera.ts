// The visual audit's camera: shoot() waits until a screen has settled (no skeleton, no toast, fonts and images
// loaded, animations over), then saves a full-page PNG of it, or of one element, as
// ${AUDIT_OUT}/<project>/<nn>-<name>.png (audit-out.ts), nn being the shot's place in shot-list.ts, and notes the
// route it was on for write-index.ts. Also the steps every audit file shares: no accessibility check, and reaching a
// destination from the navigation as the person would, through More on a phone when it isn't in the bottom bar.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { skipAccessibilityCheck } from "../support/fixtures";
import { animationsSettled } from "../support/settled";
import { auditOut } from "./audit-out";
import { SHOTS, type ShotName } from "./shot-list";

/** The shot's number, two digits: its place in the list. */
export function shotNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** The file of each project's routes, by shot name. */
export const ROUTES_FILE = "routes.json";

/** For each audit file's beforeEach: the journeys check accessibility; the audit only looks. */
export function screenshotsOnly(): void {
  skipAccessibilityCheck("The visual audit only takes screenshots; the journeys check accessibility.");
}

/** The address as the index shows it: ids as <id>, so the routes read the same in every run. */
function routeOf(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`.replaceAll(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    "<id>",
  );
}

async function settled(page: Page, { skeleton }: { skeleton: boolean }): Promise<void> {
  // Skeletons wait 200ms before they show (components/delayed.tsx): look after that, not before.
  await page.waitForTimeout(300);
  const busy = page.locator('[aria-busy="true"]').filter({ visible: true });
  if (skeleton) await expect(busy.first()).toBeVisible();
  else await expect(busy).toHaveCount(0, { timeout: 20_000 });
  // A toast's timer pauses while the pointer rests on it, and a tap leaves the emulated pointer where it tapped, often
  // where the toast then appears: move it to the corner so the toasts fade as they do for a person.
  await page.mouse.move(0, 0);
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
            }),
        ),
    );
  });
  await animationsSettled(page);
}

/**
 * The whole page. Playwright's full-page shot of a page taller than the window draws the fixed sidebar, bars and
 * overlays where the window ends, over the content; so the window is made as tall as the page for the shot, and the
 * fixed parts sit at its edges, as on a screen that tall.
 */
async function shootWholePage(page: Page, file: string): Promise<void> {
  const window = page.viewportSize();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  if (window && height > window.height) await page.setViewportSize({ width: window.width, height });
  try {
    await animationsSettled(page);
    await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  } finally {
    if (window) await page.setViewportSize(window);
  }
}

/**
 * Takes the shot `name` of the page, or of `element` alone. With `skeleton`, the screen is expected to be loading,
 * and is taken as it is. With `hover`, the pointer goes back over that once the screen has settled (settling moves it
 * to the corner), for a hover state.
 */
export async function shoot(
  page: Page,
  name: ShotName,
  { element, skeleton = false, hover }: { element?: Locator; skeleton?: boolean; hover?: Locator } = {},
): Promise<void> {
  const project = test.info().project.name;
  const index = SHOTS.findIndex((shot) => shot.name === name);
  const shot = SHOTS[index];
  if (shot && "only" in shot && shot.only !== project) throw new Error(`${name} is a shot of the ${shot.only} only`);
  await test.step(`shoot ${name}`, async () => {
    await settled(page, { skeleton });
    if (hover) {
      await hover.hover();
      await animationsSettled(page);
    }
    const directory = path.join(auditOut(), project);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${shotNumber(index)}-${name}.png`);
    if (element) await element.screenshot({ path: file, animations: "disabled" });
    else await shootWholePage(page, file);
    const routesFile = path.join(directory, ROUTES_FILE);
    const routes = await readFile(routesFile, "utf8").then(
      (text) => JSON.parse(text) as Record<string, string>,
      () => ({}),
    );
    await writeFile(routesFile, `${JSON.stringify({ ...routes, [name]: routeOf(page) }, null, 2)}\n`);
  });
}

/** Opens a destination from the navigation named `navigation` ("Main", "Console"), through More if it is there. */
export async function openFromNavigation(page: Page, navigation: string, destination: string): Promise<void> {
  const bar = page.getByRole("navigation", { name: navigation }).filter({ visible: true });
  const link = bar.getByRole("link", { name: destination, exact: true });
  if ((await link.count()) > 0) {
    await link.click();
    return;
  }
  await bar.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: destination, exact: true }).click();
}
