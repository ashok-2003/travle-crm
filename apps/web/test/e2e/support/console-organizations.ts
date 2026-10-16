// What the console's organization journeys share: a plan on sale of each journey's own (journeys run side by side on
// one database, and the console offers every plan on sale), the Owner's invite link as Mailpit received it, and
// choosing from the console's selects and its date fields' calendars.
import { expect, type Locator, type Page } from "@playwright/test";
import { test as consoleTest } from "./console";

export interface PlanOnSale {
  id: string;
  name: string;
}

export const test = consoleTest.extend<{ planOnSale: PlanOnSale }>({
  planOnSale: async ({ database }, use) => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const plan = await database.platform.plan.create({
      data: {
        key: `journey-${suffix}`,
        name: `Journey ${suffix}`,
        monthlyPricePaise: 250_000,
        yearlyPricePaise: 2_500_000,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000n,
        modules: ["crm"],
      },
      select: { id: true, name: true },
    });
    await use(plan);
  },
});

export { expect };

/** A code no other journey's organization has: 3-12 capitals and digits. */
export function organizationCode(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`.toUpperCase();
}

async function readMailpit<T>(path: string): Promise<T> {
  const base = process.env.E2E_MAILPIT_URL;
  if (!base) throw new Error("E2E_MAILPIT_URL is not set: run the journeys with `pnpm --filter @travel-crm/web e2e`");
  const response = await fetch(`${base}/api/v1${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} answered ${String(response.status)}`);
  return (await response.json()) as T;
}

/**
 * The link in the invite the worker emailed to address, a page of the web app with the token: waits up to 30 seconds,
 * since the worker's relay picks the event up and its listener sends.
 */
export async function inviteLinkSentTo(address: string): Promise<string> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { messages } = await readMailpit<{ messages: { ID: string; To: { Address: string }[] }[] }>("/messages");
    const sent = messages.find((message) => message.To.some((to) => to.Address === address));
    if (sent) {
      const { Text } = await readMailpit<{ Text: string }>(`/message/${sent.ID}`);
      const link = /https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]+/.exec(Text)?.[0];
      if (!link) throw new Error("the invite holds no link to choose a password");
      return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no invite reached ${address}`);
}

/** Picks an option from one of the console's selects by its label. */
export async function choose(page: Page, label: string, option: string | RegExp): Promise<void> {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/**
 * Chooses a day (yyyy-mm-dd) in the date field labelled `label`, as a person does: its calendar opened from the
 * button at the box's end, the day's year and month picked from the calendar's lists, then the day, named like
 * "Friday, 30 October 2026".
 */
export async function chooseDay(within: Locator, label: string, date: string): Promise<void> {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  await within.getByRole("button", { name: `Choose ${label} from the calendar` }).click();
  const calendar = within.page().locator("[data-slot=calendar]");
  await calendar.getByRole("combobox", { name: "Year" }).selectOption(String(year));
  await calendar.getByRole("combobox", { name: "Month" }).selectOption(String(month - 1));
  const words = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
  await calendar.getByRole("button", { name: new RegExp(`\\b${words}\\b`) }).click();
  await expect(calendar).toHaveCount(0);
  // The field shows the day chosen, Indian-style.
  await expect(within.getByRole("textbox", { name: label })).toHaveValue(
    `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`,
  );
}
