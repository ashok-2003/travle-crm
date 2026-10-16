// An accessibility check for a journey's screen (spec 12.1; DESIGN.md section 8 targets WCAG 2.2 AA), with axe.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Waits for every transition and animation with an end (a toast sliding in, a dialog fading) to finish: axe measures
 * colours as they are drawn, so a toast half faded in reads as low contrast, its own and that of what it covers.
 * Skeletons pulse for ever and are left out.
 */
async function settledAnimations(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) => animation.playState !== "running" || animation.effect?.getComputedTiming().endTime === Infinity,
      ),
  );
}

export async function expectAccessible(page: Page): Promise<void> {
  await settledAnimations(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target.join(" ")) })),
  ).toEqual([]);
}
