// The sign-in screen opens on email, or on the organization code once this device has used one, filled in. After
// signing in, the person goes back to the app page they were sent from (?next=), through the code step if they use
// two-factor.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInScreen } from "@/account/sign-in-screen";
import { messages } from "@/i18n/messages";
import { targetSize } from "../components/touch-targets";
import { answers, ok, renderScreen } from "./render";

const push = vi.fn();
const finishSignIn = vi.fn();
/** The address the person opened, as the browser has it: the screen reads ?next= from it when they sign in. */
const openedAs = (search: string) => { window.history.replaceState({}, "", `/sign-in${search}`); };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/account/finish-sign-in", () => ({ useFinishSignIn: () => finishSignIn }));

const { account } = messages;

afterEach(() => {
  window.localStorage.clear();
  openedAs("");
  vi.clearAllMocks();
});

async function signInByEmail() {
  await userEvent.type(screen.getByRole("textbox", { name: account.fields.email }), "asha@example.in");
  await userEvent.type(screen.getByLabelText(account.fields.password), "owner-password-1");
  await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
}

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

  it("goes back to the page the person was sent from", async () => {
    openedAs("?next=/staff");
    const signInWithEmail = answers(ok({ twoFactorRequired: false }));
    renderScreen(<SignInScreen auth={{ signInWithEmail, signInWithCode: vi.fn() }} />);
    await signInByEmail();
    expect(finishSignIn).toHaveBeenCalledWith("/staff");
  });

  it("takes that page on to the code step", async () => {
    openedAs("?next=/staff");
    const signInWithEmail = answers(ok({ twoFactorRequired: true }));
    renderScreen(<SignInScreen auth={{ signInWithEmail, signInWithCode: vi.fn() }} />);
    await signInByEmail();
    expect(push).toHaveBeenCalledWith("/sign-in/two-factor?next=%2Fstaff");
    expect(finishSignIn).not.toHaveBeenCalled();
  });

  it("offers the forgotten-password link on the email way only, as the code way has no email", async () => {
    renderScreen(<SignInScreen />);
    expect(screen.getByRole("link", { name: account.signIn.forgotPassword })).toBeVisible();
    await userEvent.click(screen.getByRole("tab", { name: account.signIn.byCode }));
    expect(screen.queryByRole("link", { name: account.signIn.forgotPassword })).toBeNull();
  });

  it("makes the forgotten-password link a 44px touch target", () => {
    renderScreen(<SignInScreen />);
    expect(targetSize(screen.getByRole("link", { name: account.signIn.forgotPassword })).height).toBeGreaterThanOrEqual(
      44,
    );
  });
});
