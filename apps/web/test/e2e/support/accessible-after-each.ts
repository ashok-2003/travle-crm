// axe after every journey (spec 12.1; DESIGN.md section 8 targets WCAG 2.2 AA), on the screen the journey ends on,
// once its animations have settled. It is automatic, so no journey can forget it: fixtures.ts builds on this test.
// A journey that ends where axe has nothing fair to judge opts out with skipAccessibilityCheck and says why.
import { test as base } from "@playwright/test";
import { expectAccessible } from "./accessibility";
import { animationsSettled } from "./settled";

const OPTED_OUT = "accessibility-check-skipped";

/** Leaves this journey's final screen unchecked. The reason is shown in the report. */
export function skipAccessibilityCheck(reason: string): void {
  if (reason.trim() === "") throw new Error("A journey that skips the accessibility check must say why");
  base.info().annotations.push({ type: OPTED_OUT, description: reason });
}

export const test = base.extend<{ accessibleAfterEach: undefined }>({
  accessibleAfterEach: [
    async ({ page }, use, testInfo) => {
      await use(undefined);
      // A journey that failed or was skipped has already said what matters.
      if (testInfo.status !== "passed" || testInfo.status !== testInfo.expectedStatus) return;
      if (testInfo.annotations.some((annotation) => annotation.type === OPTED_OUT)) return;
      // A journey that only called the api never opened a screen.
      if (page.isClosed() || page.url() === "about:blank") return;
      await animationsSettled(page);
      await expectAccessible(page);
    },
    { auto: true },
  ],
});
