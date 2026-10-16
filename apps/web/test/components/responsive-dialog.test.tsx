// ResponsiveDialog's footer (DESIGN.md: the main action stays on screen, stacked full width on phones): it renders in
// the registry's DialogFooter or SheetFooter, outside the body that scrolls, starting with Cancel, which closes the
// dialog and is disabled while the request is out; a form in the body submits from it through the form attribute.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { locale, messages } from "@/i18n/messages";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { screenIs } from "../organization/render";

const { common } = messages;

function renderDialog({
  busy = false,
  cancel,
  onOpenChange = vi.fn(),
  onSubmit = vi.fn(),
}: {
  busy?: boolean;
  cancel?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSubmit?: () => void;
} = {}) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ResponsiveDialog
        open
        onOpenChange={onOpenChange}
        busy={busy}
        title="Add staff"
        description="Who joins"
        {...(cancel === undefined ? {} : { cancel })}
        footer={
          <Button type="submit" form="the-form">
            Add
          </Button>
        }
      >
        <form
          id="the-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label>
            Name <input />
          </label>
        </form>
      </ResponsiveDialog>
    </NextIntlClientProvider>,
  );
  return screen.getByRole("dialog");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each([
  ["desktop", "wide", "dialog-footer"],
  ["phone", "phone", "sheet-footer"],
] as const)("ResponsiveDialog's footer on a %s", (_, width, footerSlot) => {
  it("sits in the registry's footer, outside the body that scrolls, with Cancel before the primary", () => {
    screenIs(width);
    const dialog = renderDialog();
    const footer = dialog.querySelector(`[data-slot=${footerSlot}]`);
    if (!(footer instanceof HTMLElement)) throw new Error("no registry footer");
    const buttons = within(footer).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([common.cancel, "Add"]);
    const body = within(dialog).getByRole("textbox", { name: "Name" }).closest(".overflow-y-auto");
    expect(body).not.toBeNull();
    expect(body?.contains(footer)).toBe(false);
  });

  it("submits the body's form from the footer, and Cancel closes the dialog", async () => {
    screenIs(width);
    const onOpenChange = vi.fn();
    const onSubmit = vi.fn();
    renderDialog({ onOpenChange, onSubmit });
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: common.cancel }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Cancel while the request is out", () => {
    screenIs(width);
    renderDialog({ busy: true });
    expect(screen.getByRole("button", { name: common.cancel })).toBeDisabled();
  });
});

it("leaves Cancel out when asked: a footer that ends the dialog itself", () => {
  screenIs("wide");
  renderDialog({ cancel: false });
  expect(screen.queryByRole("button", { name: common.cancel })).toBeNull();
  expect(screen.getByRole("button", { name: "Add" })).toBeVisible();
});
