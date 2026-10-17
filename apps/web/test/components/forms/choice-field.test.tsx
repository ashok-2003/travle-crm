// The shared choice of a few options (components/forms/choice-field.tsx), for the lead form and the console alike:
// radios in a group the legend names, each labelled and optionally explained, in 44px rows, side by side when inline;
// the error is the group's, read out with it, and the form's focus lands on the chosen radio, or the first.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChoiceField } from "@/components/forms/choice-field";
import { locale, messages } from "@/i18n/messages";

const options = [
  { value: "trial", label: "A trial", description: "Free for 14 days" },
  { value: "paid", label: "Paid from today" },
];

function Form({ initial = "", inline = false }: { initial?: string; inline?: boolean }) {
  const form = useForm<{ start: string }>({ defaultValues: { start: initial } });
  return (
    <form>
      <ChoiceField control={form.control} name="start" legend="How it starts" options={options} inline={inline} />
      <button
        type="button"
        onClick={() => {
          form.setError("start", { message: "Choose how it starts." }, { shouldFocus: true });
        }}
      >
        Check
      </button>
    </form>
  );
}

function renderForm(props: Parameters<typeof Form>[0] = {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Form {...props} />
    </NextIntlClientProvider>,
  );
}

// Radix's radio asks for ResizeObserver, which jsdom lacks; nothing here depends on layout.
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

describe("ChoiceField", () => {
  it("names the group by its legend, each option by its label and words, in 44px rows", async () => {
    renderForm();
    const group = screen.getByRole("radiogroup", { name: "How it starts" });
    expect(group).not.toHaveClass("flex-wrap");
    const trial = screen.getByRole("radio", { name: "A trial" });
    const row = trial.closest("[role=group]");
    expect(row).toHaveClass("min-h-11");
    expect(row).toHaveTextContent("Free for 14 days");
    await userEvent.click(screen.getByText("Paid from today"));
    expect(screen.getByRole("radio", { name: "Paid from today" })).toBeChecked();
  });

  it("gives its error to the group, which the form focuses on its first radio when none is chosen", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    const group = screen.getByRole("radiogroup", { name: "How it starts" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAccessibleDescription("Choose how it starts.");
    expect(screen.getByRole("radio", { name: "A trial" })).toHaveFocus();
  });

  it("focuses the chosen radio when there is one", async () => {
    renderForm({ initial: "paid" });
    await userEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByRole("radio", { name: "Paid from today" })).toHaveFocus();
  });

  it("puts the options side by side when inline", () => {
    renderForm({ inline: true });
    expect(screen.getByRole("radiogroup", { name: "How it starts" })).toHaveClass("flex-wrap");
  });
});
