// FormDialog gives the focus back when it closes: to its own trigger, or, opened from elsewhere (a menu's item), to the
// button the screen names, since Radix returns it only to a trigger of its own.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { FormDialog, useFormDialog } from "@/components/forms/form-dialog";
import { Button } from "@/components/ui/button";
import { locale, messages } from "@/i18n/messages";
import { screenIs } from "../../organization/render";

const sending = { isPending: false, reset: () => undefined };

function OwnTrigger() {
  const dialog = useFormDialog("Saved");
  return (
    <FormDialog
      dialog={dialog}
      sending={sending}
      trigger={{ label: "Change the plan" }}
      title="Change the plan"
      description="From the next cycle"
      submit="Save"
      submitting="Saving…"
    >
      {(formId) => <form id={formId} />}
    </FormDialog>
  );
}

function OpenedElsewhere() {
  const [open, setOpen] = useState(false);
  const dialog = useFormDialog("Saved", undefined, { open, setOpen });
  const menu = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={menu}
        onClick={() => {
          setOpen(true);
        }}
      >
        More
      </Button>
      <FormDialog
        dialog={dialog}
        sending={sending}
        returnFocusTo={menu}
        title="Change the plan"
        description="From the next cycle"
        submit="Save"
        submitting="Saving…"
      >
        {(formId) => <form id={formId} />}
      </FormDialog>
    </>
  );
}

function renderWithWords(ui: React.ReactElement) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const cancel = async () => {
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: messages.common.cancel }));
};

describe.each(["wide", "phone"] as const)("FormDialog on a %s screen", (width) => {
  it("gives the focus back to its own trigger when it closes", async () => {
    screenIs(width);
    renderWithWords(<OwnTrigger />);
    const trigger = screen.getByRole("button", { name: "Change the plan" });
    await userEvent.click(trigger);
    await cancel();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("gives the focus back to the button the screen names, when something else opened it", async () => {
    screenIs(width);
    renderWithWords(<OpenedElsewhere />);
    const menu = screen.getByRole("button", { name: "More" });
    await userEvent.click(menu);
    await cancel();
    await waitFor(() => {
      expect(menu).toHaveFocus();
    });
  });
});
