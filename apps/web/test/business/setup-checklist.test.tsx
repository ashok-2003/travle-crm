// The setup checklist (spec 7.1): each step says whether it is done and leads to the screen where it is done (the
// business profile for the details, bank account and invoice prefix; branding; staff); the Owner's home shows it until
// everything is done, and then the home it had before; other members' homes never ask for it.
import type { SetupChecklist } from "@travel-crm/contracts/profile";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "@/app/(app)/page";
import { SetupScreen } from "@/business/setup/setup-screen";
import { messages } from "@/i18n/messages";
import { routes } from "@/lib/routes";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { newQueryClient, renderWithApi } from "../organization/api";

const words = messages.business.setup;

const halfway: SetupChecklist = {
  steps: [
    { step: "business-details", done: true },
    { step: "bank-details", done: true },
    { step: "invoice-prefix", done: false },
    { step: "branding", done: true },
    { step: "staff", done: false },
  ],
  done: false,
};

const finished: SetupChecklist = {
  steps: halfway.steps.map(({ step }) => ({ step, done: true })),
  done: true,
};

/** Each step's link: where it leads, and whether it says Done or To do. */
const steps = () =>
  screen
    .getAllByRole("link")
    .map((link) => [
      link.getAttribute("href"),
      within(link).queryByText(words.done) ? "done" : within(link).queryByText(words.toDo) ? "to do" : "",
    ]);

describe("SetupScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leads to where each step is done, and says which are", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<SetupScreen />, newQueryClient());
    expect(await screen.findByRole("link", { name: new RegExp(words.steps["invoice-prefix"].title) })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByText(/3 of 5 done/)).toBeVisible();
    expect(steps()).toEqual([
      [routes.profile, "done"],
      [routes.profile, "done"],
      [routes.profile, "to do"],
      [routes.branding, "done"],
      [routes.staff, "to do"],
    ]);
  });

  it("says when everything is set up", async () => {
    stubApi({ "organization.setup.get": { data: finished } });
    renderWithApi(<SetupScreen />, newQueryClient());
    expect(await screen.findByText(words.allDone)).toBeVisible();
    expect(screen.getByText(/5 of 5 done/)).toBeVisible();
  });

  it("says so when the checklist didn't load, and tries again", async () => {
    const api = stubApi({ "organization.setup.get": { status: 500 } });
    renderWithApi(<SetupScreen />, newQueryClient());
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("organization.setup.get", { data: halfway });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText(/3 of 5 done/)).toBeVisible();
  });
});

describe("the home's checklist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is on the Owner's home until everything is done", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    const checklist = await screen.findByRole("region", {
      name: words.homeHeading.replace("{organization}", "Sharma Travels"),
    });
    expect(within(checklist).getByText(/3 of 5 done/)).toBeVisible();
    expect(within(checklist).getAllByRole("link")).toHaveLength(5);
    expect(screen.queryByText(messages.shell.home.intro.replace("{organization}", "Sharma Travels"))).toBeNull();
  });

  it("gives way to the Owner's usual home once everything is done", async () => {
    const api = stubApi({ "organization.setup.get": { data: finished } });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    await waitFor(() => {
      expect(api.calls).toContain("organization.setup.get");
    });
    expect(
      await screen.findByText(messages.shell.home.intro.replace("{organization}", "Sharma Travels")),
    ).toBeVisible();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the Owner's usual home under the checklist's place while it loads", async () => {
    stubApi({ "organization.setup.get": "never" });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    expect(await screen.findByRole("status", { name: messages.common.loading })).toBeVisible();
    expect(screen.getByText(messages.shell.home.intro.replace("{organization}", "Sharma Travels"))).toBeVisible();
    expect(screen.getByRole("link", { name: messages.shell.home.settings })).toBeVisible();
  });

  it("is never asked for on anyone else's home", () => {
    const api = stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<HomePage />, newQueryClient(), member({ permissions: ["settings:manage"] }));
    expect(screen.getByRole("link", { name: messages.shell.home.settings })).toBeVisible();
    expect(api.calls).toEqual([]);
  });
});
