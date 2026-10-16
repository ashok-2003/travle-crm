// The shared due field (R46): a day (DateField) and a time (TimeField) under one name, each labelled, for every due
// time a person picks on the agency's clock.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DueField } from "@/components/forms/due-field";
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
