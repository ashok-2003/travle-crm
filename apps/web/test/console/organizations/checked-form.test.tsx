// How the console's organization forms are checked: each schema refusal goes on the field it came from, and one no
// field explains is the form's own problem, said in the form's alert. A form never sends nothing and says nothing.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FormFooter } from "@/console/organizations/change-dialog";
import { checked, useCheckedForm } from "@/console/organizations/fields/checked-form";
import { locale, messages } from "@/i18n/messages";

interface Values {
  name: string;
}

/** A schema that accepts the name but refuses at a place no field of the form maps to. */
const refusedElsewhere = z
  .object({ name: z.string().min(1), plan: z.string() })
  .refine(() => false, { path: ["plan"], message: "No such plan" });

const check = (values: Values) =>
  checked(
    refusedElsewhere.safeParse({ ...values, plan: "gone" }),
    values,
    ([key]) => (key === "name" ? "name" : undefined),
    () => "nameInvalid" as const,
  );

describe("checked", () => {
  it("puts a refusal no field explains on the form as a whole", () => {
    expect(check({ name: "Kerala Trails" })).toEqual({ ok: false, problems: {}, unplaced: true });
  });

  it("still puts each field's refusal on its field", () => {
    expect(check({ name: "" })).toEqual({ ok: false, problems: { name: "required" }, unplaced: true });
  });
});

function NameForm({ send }: { send: (input: unknown) => void }) {
  const { form, onSubmit, formProblem } = useCheckedForm<Values, unknown, "required" | "nameInvalid">(
    { name: "Kerala Trails" },
    check,
    (problem) => problem,
  );
  return (
    <form noValidate onSubmit={onSubmit(send)}>
      <input aria-label="Name" {...form.register("name")} />
      <FormFooter
        sending={{ isPending: false, error: null }}
        problem={formProblem}
        label="Save"
        pendingLabel="Saving"
      />
    </form>
  );
}

describe("useCheckedForm", () => {
  it("says a refusal no field explains in the form's alert, and sends nothing", async () => {
    const send = vi.fn();
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <NameForm send={send} />
      </NextIntlClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(messages.consoleOrganizations.formProblem);
    expect(send).not.toHaveBeenCalled();
  });
});
