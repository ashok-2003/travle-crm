// A password field's show/hide button switches the field between hidden and shown, says which it will do next, and
// leaves what was typed, the focus and the browser's autocomplete hint as they were.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "@/components/password-input";
import { locale, messages } from "@/i18n/messages";

const { common } = messages;

function renderField() {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <label htmlFor="password">Password</label>
      <PasswordInput id="password" autoComplete="current-password" />
    </NextIntlClientProvider>,
  );
  return screen.getByLabelText("Password");
}

describe("PasswordInput", () => {
  it("starts hidden, with a button that shows it", () => {
    const field = renderField();
    expect(field).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: common.showPassword });
    expect(toggle).toHaveAttribute("type", "button");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the type and the label, keeping the value, the focus and the autocomplete hint", async () => {
    const field = renderField();
    await userEvent.type(field, "owner-password-1");
    await userEvent.click(screen.getByRole("button", { name: common.showPassword }));
    expect(field).toHaveAttribute("type", "text");
    expect(field).toHaveValue("owner-password-1");
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute("autocomplete", "current-password");
    const toggle = screen.getByRole("button", { name: common.hidePassword });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(toggle);
    expect(field).toHaveAttribute("type", "password");
    expect(field).toHaveValue("owner-password-1");
    expect(field).toHaveFocus();
  });

  it("toggles from the keyboard, the focus staying on the button", async () => {
    renderField();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: common.showPassword })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: common.hidePassword })).toHaveFocus();
  });
});
