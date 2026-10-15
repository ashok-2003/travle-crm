// The two sign-in forms check what was typed with the api's own rules, send it, and say plainly why a sign-in was
// refused. The organization code is remembered only after it worked.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeSignInForm } from "@/account/code-sign-in-form";
import { EmailSignInForm } from "@/account/email-sign-in-form";
import { rememberedOrganizationCode } from "@/account/remembered-code";
import { messages } from "@/i18n/messages";
import { answers, ok, refused, renderScreen } from "./render";

const { account, errors } = messages;

afterEach(() => {
  window.localStorage.clear();
});

describe("EmailSignInForm", () => {
  it("asks for what's missing before sending anything", async () => {
    const signInWithEmail = answers(ok({ twoFactorRequired: false }));
    renderScreen(<EmailSignInForm onSignedIn={vi.fn()} auth={{ signInWithEmail }} />);
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findAllByText(account.fields.required)).toHaveLength(2);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText(account.fields.invalidEmail)).toBeVisible();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("sends the email as the api compares it, and reports the outcome", async () => {
    const signInWithEmail = answers(ok({ twoFactorRequired: true }));
    const onSignedIn = vi.fn();
    renderScreen(<EmailSignInForm onSignedIn={onSignedIn} auth={{ signInWithEmail }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "  Asha@Example.IN ");
    await userEvent.type(screen.getByLabelText(account.fields.password), "owner-password-1");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(signInWithEmail).toHaveBeenCalledWith({ email: "asha@example.in", password: "owner-password-1" });
    expect(onSignedIn).toHaveBeenCalledWith({ twoFactorRequired: true });
  });

  it("says why a sign-in was refused, and how long to wait after too many tries", async () => {
    const signInWithEmail = vi
      .fn()
      .mockResolvedValueOnce(refused(401, "INVALID_EMAIL_OR_PASSWORD"))
      .mockResolvedValueOnce(refused(429, "TOO_MANY_REQUESTS", 42));
    renderScreen(<EmailSignInForm onSignedIn={vi.fn()} auth={{ signInWithEmail }} />);
    await userEvent.type(screen.getByLabelText(account.fields.email), "asha@example.in");
    await userEvent.type(screen.getByLabelText(account.fields.password), "wrong");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText(errors.auth.INVALID_EMAIL_OR_PASSWORD)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText("Too many attempts. Try again in 42 seconds.")).toBeVisible();
  });
});

describe("CodeSignInForm", () => {
  it("sends the code in capitals and remembers it once the sign-in worked", async () => {
    const signInWithCode = answers(ok({ twoFactorRequired: false }));
    renderScreen(<CodeSignInForm rememberedCode={null} onSignedIn={vi.fn()} auth={{ signInWithCode }} />);
    await userEvent.type(screen.getByLabelText(account.fields.organizationCode), "sharma");
    await userEvent.type(screen.getByLabelText(account.fields.username), "ravi");
    await userEvent.type(screen.getByLabelText(account.fields.password), "ravi-password-1");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(signInWithCode).toHaveBeenCalledWith({ orgCode: "SHARMA", username: "ravi", password: "ravi-password-1" });
    expect(rememberedOrganizationCode()).toBe("SHARMA");
  });

  it("starts with the remembered code, and forgets nothing on a refusal", async () => {
    window.localStorage.setItem("travel-crm.organization-code", "SHARMA");
    const signInWithCode = answers(refused(401, "INVALID_USERNAME_OR_PASSWORD"));
    renderScreen(<CodeSignInForm rememberedCode="SHARMA" onSignedIn={vi.fn()} auth={{ signInWithCode }} />);
    expect(screen.getByLabelText(account.fields.organizationCode)).toHaveValue("SHARMA");
    await userEvent.type(screen.getByLabelText(account.fields.username), "ravi");
    await userEvent.type(screen.getByLabelText(account.fields.password), "wrong");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText(errors.auth.INVALID_USERNAME_OR_PASSWORD)).toBeVisible();
    expect(rememberedOrganizationCode()).toBe("SHARMA");
  });

  it("refuses a code the api would refuse", async () => {
    const signInWithCode = answers(ok({ twoFactorRequired: false }));
    renderScreen(<CodeSignInForm rememberedCode={null} onSignedIn={vi.fn()} auth={{ signInWithCode }} />);
    await userEvent.type(screen.getByLabelText(account.fields.organizationCode), "SH");
    await userEvent.type(screen.getByLabelText(account.fields.username), "ravi");
    await userEvent.type(screen.getByLabelText(account.fields.password), "p");
    await userEvent.click(screen.getByRole("button", { name: account.signIn.submit }));
    expect(await screen.findByText("Use 3-12 letters or digits")).toBeVisible();
    expect(signInWithCode).not.toHaveBeenCalled();
  });
});
