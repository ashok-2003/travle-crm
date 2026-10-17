// The shared due field (R46): a day (DateField) and a time (TimeField) under one name, each labelled, for every due
// time a person picks on the agency's clock; and the time a form starts it at (suggestedDue), so "Choose a time" opens
// on a sensible one: the next whole hour at least half an hour away, or 9:00 the next working morning.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DueField, suggestedDue } from "@/components/forms/due-field";
import { locale, messages } from "@/i18n/messages";

function DueForm() {
  const form = useForm<{ day: string; time: string }>({ defaultValues: { day: "2026-10-18", time: "16:30" } });
  return <DueField control={form.control} dayName="day" timeName="time" label="Follow up on" />;
}

beforeEach(() => {
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
  vi.unstubAllGlobals();
});

describe("DueField", () => {
  it("sets a day and a time together, each labelled, under the field's name", () => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <DueForm />
      </NextIntlClientProvider>,
    );
    const due = screen.getByRole("group", { name: "Follow up on" });
    expect(within(due).getByRole("textbox", { name: messages.forms.due.day })).toHaveValue("18/10/2026");
    expect(within(due).getByLabelText(messages.forms.due.time)).toHaveValue("16:30");
  });
});

describe("suggestedDue", () => {
  const india = (iso: string) => suggestedDue("Asia/Kolkata", new Date(iso));

  it("is the next whole hour on the agency's clock, at least half an hour away", () => {
    // 4:20 pm and 4:45 pm in India.
    expect(india("2026-10-16T10:50:00Z")).toEqual({ day: "2026-10-16", time: "17:00" });
    expect(india("2026-10-16T11:15:00Z")).toEqual({ day: "2026-10-16", time: "18:00" });
  });

  it("is 9:00 the next morning once the working day is over, and 9:00 the same day before it starts", () => {
    // 7:40 pm and 11:50 pm in India: the next whole hour would be after 8 pm.
    expect(india("2026-10-16T14:10:00Z")).toEqual({ day: "2026-10-17", time: "09:00" });
    expect(india("2026-10-16T18:20:00Z")).toEqual({ day: "2026-10-17", time: "09:00" });
    // 6:00 am in India.
    expect(india("2026-10-16T00:30:00Z")).toEqual({ day: "2026-10-16", time: "09:00" });
  });

  it("follows the agency's zone, not the device's", () => {
    // 10:50 UTC is 4:20 pm in India and 11:50 am in London (BST).
    expect(suggestedDue("Europe/London", new Date("2026-10-16T10:50:00Z"))).toEqual({
      day: "2026-10-16",
      time: "13:00",
    });
  });
});
