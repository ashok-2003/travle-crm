// A group trip's page (prices, departures, trip details) and its departures calendar: an Owner adds Regular prices, adds a
// Christmas season, adds a departure that repeats every week, sees each one's price and seats on the calendar, gives one a
// Quad price of its own, cancels and reopens one, and edits the Trip details alone. The calendar is a month grid on a
// desktop and the month's list on a phone, so each step reaches a day the way that screen does.
import type { Locator, Page } from "@playwright/test";
import { expectAccessible } from "./support/accessibility";
import { inputDay } from "./support/departures";
import { expect, signInByEmail, test } from "./support/fixtures";
import { dayInIndia } from "./support/leads";
import { aPackage, updatePackage } from "./support/packages";

test.use({ actionTimeout: 15_000 });

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 Dec" (the year too in another year), as the calendar names a day. */
function shownDay(day: string): string {
  const [year, month, date] = day.split("-");
  const thisYear = dayInIndia(0).slice(0, 4);
  return `${String(Number(date))} ${MONTH_NAMES[Number(month) - 1] ?? ""}${year === thisYear ? "" : ` ${year ?? ""}`}`;
}

/** "Fri 4 Dec": the same with the weekday, as the phone's list and the panel say it. */
function shownWeekday(day: string): string {
  const weekday = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
  return `${weekday} ${shownDay(day)}`;
}

/** A departure's button: its day on a desktop, its line in the month's list on a phone; `words` is a pattern for the rest. */
function departureOn(page: Page, phone: boolean, day: string, words: string): Locator {
  return phone
    ? page.getByRole("button", { name: new RegExp(`^${shownWeekday(day)} · ${words}`) })
    : page.getByRole("button", { name: new RegExp(`^${shownDay(day)}, ${words}`) });
}

/** Turns the calendar's months until `visible` shows. */
async function showMonthOf(page: Page, visible: Locator) {
  // The month may still be reading its days: give the day a moment before turning on.
  const shown = async () =>
    visible.waitFor({ timeout: 2_000 }).then(
      () => true,
      () => false,
    );
  for (let turns = 0; turns < 4 && !(await shown()); turns += 1) {
    await page.getByRole("button", { name: "Next month" }).click();
  }
  await expect(visible).toBeVisible();
}

/** The panel of the day tapped: a side panel on a desktop, a sheet on a phone. */
function panelOf(page: Page, phone: boolean): Locator {
  return phone ? page.getByRole("dialog") : page.getByRole("complementary");
}

/** Opens the panel of a day with a departure. */
async function openDeparture(page: Page, phone: boolean, day: string, words: string): Promise<Locator> {
  const button = departureOn(page, phone, day, words);
  await showMonthOf(page, button);
  await button.click();
  return panelOf(page, phone);
}

/** Opens the panel of an empty day ahead: its button on a desktop; "Add a departure" and a day to pick on a phone. */
async function openEmptyDay(page: Page, phone: boolean, day: string): Promise<Locator> {
  if (phone) {
    await page.getByRole("button", { name: "Add a departure", exact: true }).click();
    const panel = page.getByRole("dialog");
    await panel.getByRole("textbox", { name: "Day of the departure" }).fill(inputDay(day));
    await expect(panel.getByRole("heading", { name: shownWeekday(day) })).toBeVisible();
    return panel;
  }
  const button = page.getByRole("button", { name: new RegExp(`^${shownDay(day)}$`) });
  await showMonthOf(page, button);
  await button.click();
  return panelOf(page, phone);
}

test("an Owner prices a group trip, adds a season and weekly departures, changes one, cancels and reopens one, and edits the trip details alone", async ({
  page,
  agency,
}, testInfo) => {
  test.setTimeout(300_000);
  const phone = testInfo.project.name === "phone";
  await signInByEmail(page, agency.owner);
  const packageId = await aPackage(page, "Spiti 6N7D");
  await updatePackage(page, packageId, {
    kind: "group",
    roomTypes: ["triple", "double"],
    seatsPerDeparture: 20,
    nights: 6,
    startCity: "Delhi",
  });

  await page.goto(`/packages/${packageId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Spiti 6N7D" })).toBeVisible();
  const prices = page.getByRole("region", { name: "Prices", exact: true });
  await expect(prices).toContainText("No season yet");

  // Regular prices: a first season with no end date, then a Quad row added in the table.
  await prices.getByRole("button", { name: "Add season" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Regular");
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(dayInIndia(1)));
  await dialog.getByRole("switch", { name: "Until I change it" }).check();
  await dialog.getByLabel("Triple, per person").fill("6,999");
  await dialog.getByLabel("Double, per person").fill("7,799");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(prices.getByRole("textbox", { name: "Triple, Regular" })).toHaveValue(/6,?999/);
  await prices.getByRole("button", { name: "Add room type" }).click();
  await page.getByRole("menuitem", { name: "Quad" }).click();
  await prices.getByRole("textbox", { name: "Quad, Regular" }).fill("6,499");
  await prices.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices saved").first()).toBeVisible();
  await expect(prices.getByRole("textbox", { name: "Quad, Regular" })).toHaveValue(/6,?499/);

  // Christmas: its own prices for the days it covers; the departures calendar names it in its legend.
  const christmas = { from: dayInIndia(40), to: dayInIndia(54) };
  await prices.getByRole("button", { name: "Add season" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Christmas");
  await dialog.getByRole("textbox", { name: "First day" }).fill(inputDay(christmas.from));
  await dialog.getByRole("textbox", { name: "Last day" }).fill(inputDay(christmas.to));
  await dialog.getByLabel("Triple, per person").fill("8,499");
  await dialog.getByLabel("Double, per person").fill("9,499");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
  await expect(prices.getByRole("textbox", { name: "Triple, Christmas" })).toHaveValue(/8,?499/);
  const departures = page.getByRole("region", { name: "Departures", exact: true });
  await expect(departures.getByRole("list", { name: "Seasons" })).toContainText("Christmas");

  // A departure on an empty day, repeating every week until a date before Christmas.
  const weeks = [dayInIndia(10), dayInIndia(17), dayInIndia(24), dayInIndia(31)];
  const [first = "", second = ""] = weeks;
  let panel = await openEmptyDay(page, phone, first);
  await panel.getByRole("switch", { name: /^Repeat every / }).check();
  await panel.getByRole("textbox", { name: "Repeat every week until" }).fill(inputDay(dayInIndia(34)));
  await panel.getByRole("button", { name: /^Add a departure on / }).click();
  await expect(page.getByText(/\d+ departures added/).first()).toBeVisible();
  if (phone) await page.keyboard.press("Escape");

  // Each shows its price and its seats.
  const words = "(?:departure, )?(?:from )?₹6,499(?:,| ·) (?:20 left|20 of 20 left)";
  for (const day of weeks) await showMonthOf(page, departureOn(page, phone, day, words));

  // One departure's own Quad price.
  panel = await openDeparture(page, phone, first, words);
  await expect(panel).toContainText("Season: Regular");
  await expect(panel).toContainText("Quad ₹6,499");
  await panel.getByRole("button", { name: "Price for this departure only" }).click();
  await panel.getByLabel("Quad, per person").fill("5,999");
  await panel.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Prices for this departure saved").first()).toBeVisible();
  await expect(panelOf(page, phone)).toContainText("Quad ₹5,999");
  await expect(panelOf(page, phone)).toContainText("Set for this departure only");

  // Cancel the next week's departure, then reopen it.
  if (phone) await page.keyboard.press("Escape");
  panel = await openDeparture(page, phone, second, words);
  await panel.getByRole("button", { name: "Cancel departure" }).click();
  dialog = page.getByRole("dialog").filter({ has: page.getByLabel("Why is it cancelled?") });
  await dialog.getByLabel("Why is it cancelled?").fill("Road closed");
  await dialog.getByRole("button", { name: "Cancel departure" }).click();
  await expect(dialog).toBeHidden();
  const gone = phone
    ? page.getByRole("button", { name: new RegExp(`^${shownWeekday(second)} · Cancelled`) })
    : page.getByRole("button", { name: new RegExp(`^${shownDay(second)}, departure cancelled`) });
  // On a phone the day's sheet stays over the list: it shows the change, then is closed to see the list.
  await expect(panelOf(page, phone)).toContainText("This departure is cancelled.");
  if (phone) await page.keyboard.press("Escape");
  await expect(gone).toBeVisible();
  await gone.click();
  await panelOf(page, phone).getByRole("button", { name: "Reopen this departure" }).click();
  if (phone) await page.keyboard.press("Escape");
  await expect(departureOn(page, phone, second, words)).toBeVisible();

  // The page fits the phone's width.
  if (phone) {
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  // The Trip details alone: what the trip includes changes, and the Prices section reads as it did.
  const pricesBefore = await prices.innerText();
  await page.getByRole("button", { name: "Edit Trip details" }).click();
  await page.getByLabel("Inclusions").fill("Breakfast and dinner");
  await page.getByRole("group", { name: "Trip details" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Edit Trip details" })).toBeVisible();
  await expect(page.getByText("Breakfast and dinner").first()).toBeVisible();
  expect(await prices.innerText()).toBe(pricesBefore);
  await expectAccessible(page);
});
