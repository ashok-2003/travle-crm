// The shared date field (the owner's rule: every date input is this one): a 44px input group, shaped as every input,
// where the day is typed as dd/mm/yyyy or chosen from the registry Calendar behind the button at its end (Indian:
// weeks from Monday, in the app's own words); the value kept as the api's yyyy-mm-dd, and text that isn't a day kept
// for the form's check to name; the hint and the error linked as every field's.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateField, indianDate, parseIndianDate } from "@/components/date-field";
import { locale, messages } from "@/i18n/messages";
import { targetSize } from "./touch-targets";

const { calendar } = messages;

const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A form whose check wants a calendar day, as the api's schemas do. */
function DayForm({ day, onSave }: { day: string; onSave: (day: string) => void }) {
  const form = useForm<{ day: string }>({
    defaultValues: { day },
    resolver: (values) =>
      CALENDAR_DAY.test(values.day)
        ? { values, errors: {} }
        : { values: {}, errors: { day: { type: "validate", message: "Choose a day." } } },
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

const box = () => screen.getByRole("textbox", { name: "Paid on" });

async function openCalendar(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole("button", { name: "Choose Paid on from the calendar" }));
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

describe("indianDate and parseIndianDate", () => {
  it("write a calendar day as Indian screens do, day first, and read one back", () => {
    expect(indianDate("2026-03-05")).toBe("05/03/2026");
    expect(parseIndianDate("05/03/2026")).toBe("2026-03-05");
    expect(parseIndianDate(" 5-3-2026 ")).toBe("2026-03-05");
    expect(parseIndianDate("5.3.2026")).toBe("2026-03-05");
  });

  it("read no day from text that isn't a real one", () => {
    for (const text of ["31/02/2026", "13/13/2026", "2026-03-05", "05/03/26", ""]) {
      expect(parseIndianDate(text), text).toBeNull();
    }
  });
});

describe("DateField", () => {
  it("shows the day as dd/mm/yyyy in a 44px input group named by its label", () => {
    renderField("2026-10-16");
    expect(box()).toHaveValue("16/10/2026");
    const group = box().closest<HTMLElement>("[data-slot=input-group]");
    expect(targetSize(group ?? document.body).height).toBeGreaterThanOrEqual(44);
  });

  it("shows the format in the app's words while empty", () => {
    renderField("", { ...messages, calendar: { ...messages.calendar, placeholder: "DD-MM-YYYY" } });
    expect(box()).toHaveAttribute("placeholder", "DD-MM-YYYY");
  });

  it("keeps a typed day as yyyy-mm-dd, and writes it out in full once left", async () => {
    const onSave = renderField();
    await userEvent.type(box(), "1/2/2027");
    await userEvent.tab();
    expect(box()).toHaveValue("01/02/2027");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("2027-02-01");
  });

  it("keeps text that isn't a day as typed, for the form's check to refuse", async () => {
    const onSave = renderField();
    await userEvent.type(box(), "31/02/2026");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(box()).toHaveValue("31/02/2026");
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("chooses a day from the calendar, kept as yyyy-mm-dd, and gives the focus back", async () => {
    const onSave = renderField();
    const popover = await openCalendar();
    await userEvent.click(within(popover).getByRole("button", { name: "Friday, 30 October 2026" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(box()).toHaveValue("30/10/2026");
    expect(screen.getByRole("button", { name: "Choose Paid on from the calendar" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("2026-10-30");
  });

  it("opens at the chosen day's month, weeks from Monday, days 44px (40px under 360px), in the app's words", async () => {
    renderField("2027-03-14");
    const popover = await openCalendar();
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

  it("mutes the days outside the month on the day buttons themselves", async () => {
    renderField("2026-10-16");
    const popover = await openCalendar();
    // October 2026 starts on a Thursday: its first row holds 28-30 September.
    const outside = within(popover).getByRole("button", { name: "Monday, 28 September 2026" });
    expect(outside.closest("[data-outside=true]")).not.toBeNull();
    expect(outside).toHaveClass("group-data-[outside=true]/day:text-muted-foreground");
  });

  it("opens at today's month while no day is chosen, and says which day is today", async () => {
    renderField();
    const popover = await openCalendar();
    expect(within(popover).getByRole("button", { name: "Today, Friday, 16 October 2026" })).toBeVisible();
    await userEvent.click(within(popover).getByRole("button", { name: calendar.nextMonth }));
    expect(within(popover).getByRole("grid", { name: "November 2026" })).toBeVisible();
  });

  it("links its hint and its error, and is marked invalid while the error stands", async () => {
    const onSave = renderField();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(box()).toHaveAccessibleDescription("The day the money arrived. Choose a day.");
    expect(onSave).not.toHaveBeenCalled();
  });
});
