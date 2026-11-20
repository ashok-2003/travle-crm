// My tasks' and Follow-ups' tabs (web revamp part 2): opens the tab whose words are `name`, its count after them, and
// gives back its panel, which keeps that name while the count changes.
import type { Locator, Page } from "@playwright/test";

export const tabNamed = (name: string) => new RegExp(`^${name}( [\\d,]+)?$`);

export async function openTab(page: Page, name: string): Promise<Locator> {
  await page.getByRole("tab", { name: tabNamed(name) }).click();
  return page.getByRole("tabpanel", { name: tabNamed(name) });
}
