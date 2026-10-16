// The shared date field (the owner's rule: every date input is this one): the day shown as dd/mm/yyyy on a 44px
// button named by its label and that day; the registry Calendar in a popover to choose one, Indian (weeks from Monday)
// and in the app's own words; the value kept as the api's yyyy-mm-dd; the hint and the error linked as every field's.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateField, indianDate } from "@/components/date-field";
import { locale, messages } from "@/i18n/messages";
import { targetSize } from "./touch-targets";

const { calendar } = messages;

function DayForm({ day, onSave }: { day: string; onSave: (day: string) => void }) {
  const form = useForm<{ day: string }>({
    defaultValues: { day },
    resolver: (values) =>
      values.day === ""
        ? { values: {}, errors: { day: { type: "required", message: "Choose the day." } } }
        : { values, errors: {} },
  });
  const save = form.handleSubmit((values) => {
    onSave(values.day);
  });
  return (
    <form onSubmit={(event) => void save(event)}>
      <DateField control={form.control} name="day" label="Paid on" hint="The day the money arrived." />
      <button type="submit">Save</button>
    </form>
  );
}

function renderField(day = "", words = messages) {
  const onSave = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={words}>
      <DayForm day={day} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return onSave;
}

async function openCalendar(name: string): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  // Today is fixed, so the calendar opens on a known month; only Date is faked, so user events still run.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 12));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("indianDate", () => {
  it("writes a calendar day as Indian screens do, day first", () => {
    expect(indianDate("2026-03-05")).toBe("05/03/2026");
  });
});

describe("DateField", () => {
  it("shows the day as dd/mm/yyyy on a 44px button named by its label and the day", () => {
    renderField("2026-10-16");
    const button = screen.getByRole("button", { name: "Paid on 16/10/2026" });
    expect(button).toHaveTextContent("16/10/2026");
    expect(targetSize(button).height).toBeGreaterThanOrEqual(44);
  });

  it("shows its empty hint in the app's words, hidden from screen readers", () => {
    renderField("", { ...messages, calendar: { ...messages.calendar, placeholder: "DD-MM-YYYY" } });
    const hint = within(screen.getByRole("button", { name: "Paid on" })).getByText("DD-MM-YYYY");
    expect(hint).toHaveAttribute("aria-hidden", "true");
  });

  it("is named by its label alone while no day is chosen", () => {
    renderField();
    expect(screen.getByRole("button", { name: "Paid on" })).not.toHaveTextContent(/\d/);
  });

  it("chooses a day from the calendar, keeps it as yyyy-mm-dd, and gives the focus back", async () => {
    const onSave = renderField();
    const popover = await openCalendar("Paid on");
    await userEvent.click(within(popover).getByRole("button", { name: "Friday, 30 October 2026" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Paid on 30/10/2026" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("2026-10-30");
  });

  it("opens at the chosen day's month, weeks from Monday, its days 44px (40px under 360px) and named in the app's words", async () => {
    renderField("2027-03-14");
    const popover = await openCalendar("Paid on 14/03/2027");
    expect(within(popover).getByRole("grid", { name: "March 2027" })).toBeVisible();
    // DayPicker hides the weekdays' row from screen readers: each day's name says its weekday.
    expect(within(popover).getAllByRole("columnheader", { hidden: true })[0]).toHaveAccessibleName("Monday");
    expect(within(popover).getByRole("button", { name: "Sunday, 14 March 2027, chosen" })).toBeVisible();
    expect(within(popover).getByRole("combobox", { name: calendar.year })).toHaveValue("2027");
    expect(within(popover).getByRole("combobox", { name: calendar.month })).toBeVisible();
    expect(within(popover).getByRole("button", { name: calendar.previousMonth })).toBeVisible();
    expect(within(popover).getByRole("navigation", { name: calendar.navigation })).toBeVisible();
    expect(popover.querySelector("[data-slot=calendar]")).toHaveClass(
      "[--cell-size:--spacing(10)]",
      "min-[360px]:[--cell-size:--spacing(11)]",
    );
  });

  it("opens at today's month while no day is chosen, and says which day is today", async () => {
    renderField();
    const popover = await openCalendar("Paid on");
    expect(within(popover).getByRole("button", { name: "Today, Friday, 16 October 2026" })).toBeVisible();
    await userEvent.click(within(popover).getByRole("button", { name: calendar.nextMonth }));
    expect(within(popover).getByRole("grid", { name: "November 2026" })).toBeVisible();
  });

  it("links its hint and its error, and is marked invalid while the error stands", async () => {
    const onSave = renderField();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const button = screen.getByRole("button", { name: "Paid on" });
    expect(button).toHaveAttribute("aria-invalid", "true");
    expect(button).toHaveAccessibleDescription("The day the money arrived. Choose the day.");
    expect(onSave).not.toHaveBeenCalled();
  });
});
