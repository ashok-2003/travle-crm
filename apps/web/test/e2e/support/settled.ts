// Waits for a page's opening animations (a dialog fading in, a sheet sliding up) to end, so checks such as colour
// contrast see the screen as a person does, not half-transparent. Endless animations (skeleton pulses) are ignored,
// and so are animations cancelled on the way (a menu closing as the dialog it opened appears).
import type { Page } from "@playwright/test";

export async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}
