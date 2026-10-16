// The console's own form fields, labelled and linked as every field is: a rupee box after its ₹ (the input group's
// addon), grouped the Indian way once left; a select whose hint and error are read with it; and a choice whose error
// is its group's, which the form focuses, in 44px rows.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { ChoiceField } from "@/console/organizations/fields/choice-field";
import { MoneyField } from "@/components/forms/money-field";
import { SelectField } from "@/components/forms/select-field";
import { locale, messages } from "@/i18n/messages";

interface Values {
  amount: string;
  cycle: string;
  start: string;
}

/** A form whose every field is refused, so each shows its error once sent. */
function Fields() {
  const form = useForm<Values>({
    defaultValues: { amount: "", cycle: "", start: "" },
    resolver: () => ({
      values: {},
      errors: {
        amount: { type: "validate", message: "Type an amount." },
        cycle: { type: "validate", message: "Choose a cycle." },
        start: { type: "validate", message: "Choose how it starts." },
      },
    }),
  });
  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(() => undefined)(event)}>
      <ChoiceField
        control={form.control}
        name="start"
        legend="How it starts"
        options={[
          { value: "trial", label: "A trial" },
          { value: "paid", label: "Paid" },
        ]}
      />
      <MoneyField control={form.control} name="amount" label="Amount received" hint="GST included." />
      <SelectField
        control={form.control}
        name="cycle"
        label="Billing"
        hint="How often it is paid."
        options={[{ value: "monthly", label: "Monthly" }]}
      />
      <button type="submit">Send</button>
    </form>
  );
}

function renderFields() {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = () => undefined;
      unobserve = () => undefined;
      disconnect = () => undefined;
    },
  );
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Fields />
    </NextIntlClientProvider>,
  );
}

describe("the console's form fields", () => {
  it("put the ₹ before the rupee box as the input group's addon, and group what was typed once left", async () => {
    renderFields();
    const box = screen.getByRole("textbox", { name: "Amount received" });
    expect(box.closest("[data-slot=input-group]")).toHaveTextContent("₹");
    expect(box).toHaveClass("numbers", "text-right");
    await userEvent.type(box, "250000");
    await userEvent.tab();
    expect(box).toHaveValue("2,50,000");
  });

  it("read each field's hint and error with it, and mark it invalid", async () => {
    renderFields();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    const box = screen.getByRole("textbox", { name: "Amount received" });
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription("GST included. Type an amount.");
    const select = screen.getByRole("combobox", { name: "Billing" });
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("How often it is paid. Choose a cycle.");
  });

  it("give a choice's error to its group, which the form focuses, its rows 44px high", async () => {
    renderFields();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    const group = screen.getByRole("radiogroup", { name: "How it starts" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Choose how it starts.");
    // The first field in error takes the focus; a radio group passes it to its first radio.
    expect(screen.getByRole("radio", { name: "A trial" })).toHaveFocus();
    expect(screen.getByRole("radio", { name: "Paid" }).closest("[data-slot=field]")).toHaveClass("min-h-11");
    // A label with no words under it sits on the radio's line, in the row's middle, outside any field content.
    expect(screen.getByText("Paid").closest("[data-slot=field-content]")).toBeNull();
  });
});
