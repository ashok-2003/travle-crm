// The sign-in screen opens on email, or on the organization code once this device has used one, filled in.
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInScreen } from "@/account/sign-in-screen";
import { messages } from "@/i18n/messages";
import { renderScreen } from "./render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const { account } = messages;

afterEach(() => {
  window.localStorage.clear();
});

describe("SignInScreen", () => {
  it("opens on email the first time", () => {
    renderScreen(<SignInScreen />);
    expect(screen.getByRole("tab", { name: account.signIn.byEmail })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: account.fields.email })).toBeVisible();
  });

  it("opens on the organization code, filled in, once one worked here", () => {
    window.localStorage.setItem("travel-crm.organization-code", "SHARMA");
    renderScreen(<SignInScreen />);
    expect(screen.getByRole("tab", { name: account.signIn.byCode })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: account.fields.organizationCode })).toHaveValue("SHARMA");
  });
});
