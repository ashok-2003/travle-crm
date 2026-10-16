// The shared time field: the registry Input as a time box (rule 5 bans only date inputs, R46), labelled and hinted as
// every field is, its value the api's 24-hour HH:MM and "" while empty, so the form's check can name a missing time.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { TimeField } from "@/components/forms/time-field";
import { locale, messages } from "@/i18n/messages";
import { targetSize } from "./touch-targets";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function TimeForm({ onSave }: { onSave: (at: string) => void }) {
  const form = useForm<{ at: string }>({
    defaultValues: { at: "" },
    resolver: (values) =>
      TIME.test(values.at)
        ? { values, errors: {} }
        : { values: {}, errors: { at: { type: "validate", message: "Choose a time." } } },
  });
  return (
    <form
      onSubmit={(event) =>
        void form.handleSubmit((values) => {
          onSave(values.at);
        })(event)
      }
    >
      <TimeField control={form.control} name="at" label="At" hint="On the agency's clock." />
      <button type="submit">Save</button>
    </form>
  );
}

describe("TimeField", () => {
  it("keeps a time as HH:MM and names a missing one", async () => {
    const onSave = vi.fn();
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <TimeForm onSave={onSave} />
      </NextIntlClientProvider>,
    );
    const box = screen.getByLabelText("At");
    expect(box).toHaveAttribute("type", "time");
    expect(targetSize(box).height).toBeGreaterThanOrEqual(44);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Choose a time.")).toBeVisible();
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(/Choose a time\./);
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "16:30" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("16:30");
    expect(box).toHaveAccessibleDescription("On the agency's clock.");
  });
});
