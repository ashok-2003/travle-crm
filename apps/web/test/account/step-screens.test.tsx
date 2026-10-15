// The screens for a step outside the app shell (choosing a password, setting up two-factor) start from me.get: while
// it loads they show a labelled skeleton, if it fails they say so and offer Try again, and a step the person chose
// themselves has a way back to their account, unlike one the api insists on or one the app sent them to with ?next=.
import type { PendingStep } from "@travel-crm/contracts/identity";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordScreen } from "@/account/change-password-screen";
import { TwoFactorSetupScreen } from "@/account/two-factor-setup-screen";
import { messages } from "@/i18n/messages";
import { member } from "../support/members";
import { renderScreen } from "./render";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const { account, common } = messages;

/** me.get answering as the api does: one result in a tRPC batch. */
function answering(pendingStep: PendingStep | null = null) {
  return () => Promise.resolve(Response.json([{ result: { data: { ...member(), pendingStep } } }]));
}
const offline = () => Promise.reject(new TypeError("Failed to fetch"));
const stillLoading = () => new Promise<never>(() => undefined);

/** The api as the screens' tRPC client reaches it: each call gets the next answer, and the last one repeats. */
function apiAnswers(...answers: (() => Promise<Response>)[]): void {
  const fetch = vi.fn<() => Promise<Response>>();
  for (const answer of answers.slice(0, -1)) fetch.mockImplementationOnce(answer);
  fetch.mockImplementation(answers.at(-1) ?? stillLoading);
  vi.stubGlobal("fetch", fetch);
}

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.search = "";
});

const screens: [string, ComponentType, string, PendingStep][] = [
  ["ChangePasswordScreen", ChangePasswordScreen, account.changePassword.title, "CHANGE_PASSWORD"],
  ["TwoFactorSetupScreen", TwoFactorSetupScreen, account.twoFactorSetup.title, "SET_UP_TWO_FACTOR"],
];

describe.each(screens)("%s", (_, Screen, title, step) => {
  it("shows a labelled skeleton while the person's details load", async () => {
    apiAnswers(stillLoading);
    renderScreen(<Screen />);
    expect(await screen.findByRole("status", { name: common.loading })).toHaveAttribute("aria-busy", "true");
  });

  it("says when the person's details didn't load, and loads them on Try again", async () => {
    apiAnswers(offline, answering());
    renderScreen(<Screen />);
    expect(await screen.findByText(account.steps.loadFailed)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: common.tryAgain }));
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  it("leads back to the account when the person chose this step", async () => {
    apiAnswers(answering());
    renderScreen(<Screen />);
    expect(await screen.findByRole("link", { name: account.steps.backToAccount })).toHaveAttribute("href", "/account");
  });

  it("offers no way around a step the api insists on", async () => {
    apiAnswers(answering(step));
    renderScreen(<Screen />);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(screen.queryByRole("link", { name: account.steps.backToAccount })).toBeNull();
  });

  it("offers no way around a step the app sent the person to, to come back to ?next= afterwards", async () => {
    navigation.search = "next=%2Fconsole";
    apiAnswers(answering());
    renderScreen(<Screen />);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(screen.queryByRole("link", { name: account.steps.backToAccount })).toBeNull();
  });
});
