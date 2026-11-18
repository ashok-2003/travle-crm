// On a phone a My tasks or Follow-ups section is a collapsible and only the first starts open: opens a named one if it
// is closed (nothing to do on a wide screen, where there is no trigger).
import { expect, type Locator } from "@playwright/test";

export async function opened(section: Locator, name: string): Promise<void> {
  await expect(section).toBeVisible();
  const trigger = section.getByRole("button", { name, exact: true, expanded: false });
  if ((await trigger.count()) > 0) await trigger.click();
}
