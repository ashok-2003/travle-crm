// Choosing a day in the shared DateField as a person does: its button opens the calendar, the day's year and month
// are picked from the calendar's lists, then the day itself, found by its name ("Friday, 30 October 2026").
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { messages } from "@/i18n/messages";

/** Chooses `date` (yyyy-mm-dd) in the DateField whose button is `field`. */
export async function chooseDay(field: HTMLElement, date: string): Promise<void> {
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number);
  await userEvent.click(field);
  const calendar = (await screen.findByRole("grid")).closest<HTMLElement>("[data-slot=calendar]");
  if (!calendar) throw new Error("the calendar didn't open");
  const lists = within(calendar);
  await userEvent.selectOptions(lists.getByRole("combobox", { name: messages.calendar.year }), String(year));
  await userEvent.selectOptions(lists.getByRole("combobox", { name: messages.calendar.month }), String(month - 1));
  const words = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(year, month - 1, day),
  );
  await userEvent.click(lists.getByRole("button", { name: new RegExp(`\\b${words}\\b`) }));
}
