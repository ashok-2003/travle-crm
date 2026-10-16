// The setup checklist (spec 7.1), from organization.setup.get: the setup screen lists every step, done or to do, each
// leading to where it is done (the business profile's steps to their section); Home's setup card, for whoever may
// change the settings (the Owner, an Admin), sits above the usual Home with the steps still to do until everything is
// done; a step whose screen the member's role can't open isn't theirs, on either; other members never ask for it.
import type { SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";
import { starterRoles } from "@travel-crm/domain/identity";
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
const usualHome = messages.shell.home.intro;
const cardName = words.homeHeading.replace("{organization}", "Sharma Travels");

/** A member of one of the roles every organization starts with, holding its real permissions. */
function ofStarterRole(key: string) {
  const role = starterRoles.find((starter) => starter.key === key);
  if (!role) throw new Error(`no starter role ${key}`);
  return member({ permissions: role.grants.map((grant) => grant.permission) });
}

/** Where the business profile's steps lead: their own section of it. */
const profileSection = (step: SetupStep) => `${routes.profile}#${step}`;

const checklistWith = (toDo: SetupStep[]): SetupChecklist => {
  const steps = (
    ["business-details", "contact-phone", "logo", "branding", "bank-details", "invoice-prefix", "staff"] as const
  ).map((step) => ({ step, done: !toDo.includes(step) }));
  return { steps, done: toDo.length === 0 };
};

const halfway = checklistWith(["logo", "invoice-prefix", "staff"]);
/** The demo agency's: everything but a logo. */
const allButTheLogo = checklistWith(["logo"]);
const finished = checklistWith([]);

/** Each step in the list inside `container`: its title, where it leads, and the status it says, if any. */
const stepsIn = (container: HTMLElement) =>
  within(within(container).getByRole("list"))
    .getAllByRole("link")
    .map((link) => [
      link.querySelector("[data-slot=item-title]")?.textContent,
      link.getAttribute("href"),
      within(link).queryByText(words.done) ? "done" : within(link).queryByText(words.toDo) ? "to do" : "",
    ]);

describe("SetupScreen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leads to where each step is done, in order, and says which are", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<SetupScreen />, newQueryClient());
    expect(await screen.findByRole("progressbar", { name: "4 of 7 done" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: words.title })).toBeVisible();
    expect(screen.getByRole("link", { name: messages.settings.title })).toHaveAttribute("href", routes.settings);
    expect(stepsIn(document.body)).toEqual([
      [words.steps["business-details"].title, profileSection("business-details"), "done"],
      [words.steps["contact-phone"].title, profileSection("contact-phone"), "done"],
      [words.steps.logo.title, routes.branding, "to do"],
      [words.steps.branding.title, routes.branding, "done"],
      [words.steps["bank-details"].title, profileSection("bank-details"), "done"],
      [words.steps["invoice-prefix"].title, profileSection("invoice-prefix"), "to do"],
      [words.steps.staff.title, routes.staff, "to do"],
    ]);
  });

  it("leaves out the Staff step for a role that can't open the staff screen, and counts the rest", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<SetupScreen />, newQueryClient(), member({ permissions: ["settings:manage"] }));
    expect(await screen.findByRole("progressbar", { name: "4 of 6 done" })).toBeVisible();
    expect(stepsIn(document.body).map(([title]) => title)).not.toContain(words.steps.staff.title);
    expect(stepsIn(document.body)).toHaveLength(6);
  });

  it("says when everything is set up", async () => {
    stubApi({ "organization.setup.get": { data: finished } });
    renderWithApi(<SetupScreen />, newQueryClient());
    expect(await screen.findByText(words.allDone)).toBeVisible();
    expect(screen.getByText("7 of 7 done")).toBeVisible();
  });

  it("says so when the checklist didn't load, and tries again", async () => {
    const api = stubApi({ "organization.setup.get": { status: 500 } });
    renderWithApi(<SetupScreen />, newQueryClient());
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("organization.setup.get", { data: halfway });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText("4 of 7 done")).toBeVisible();
  });
});

describe("Home's setup card", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("comes first on the Owner's Home, above the usual Home, with the steps still to do and the way to all", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    const card = await screen.findByRole("region", { name: cardName });
    expect(within(card).getByRole("heading", { level: 2, name: cardName })).toBeVisible();
    expect(within(card).getByRole("progressbar", { name: "4 of 7 done" })).toBeVisible();
    // Only what is left, so no row needs a status.
    expect(stepsIn(card)).toEqual([
      [words.steps.logo.title, routes.branding, ""],
      [words.steps["invoice-prefix"].title, profileSection("invoice-prefix"), ""],
      [words.steps.staff.title, routes.staff, ""],
    ]);
    expect(within(card).getByText(words.steps.logo.hint)).toBeVisible();
    expect(within(card).getByRole("link", { name: words.everyStep })).toHaveAttribute("href", routes.setup);
    // Above the usual Home, never instead of it.
    const home = screen.getByText(usualHome);
    expect(card.compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: messages.shell.home.settings })).toBeVisible();
  });

  it("shows an Admin the card too: their role holds settings:manage", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<HomePage />, newQueryClient(), ofStarterRole("org-admin"));
    const card = await screen.findByRole("region", { name: cardName });
    expect(within(card).getByText("4 of 7 done")).toBeVisible();
  });

  it("leaves out the Staff step for a role that can't open the staff screen, and counts the rest", async () => {
    stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<HomePage />, newQueryClient(), member({ permissions: ["settings:manage"] }));
    const card = await screen.findByRole("region", { name: cardName });
    expect(within(card).getByRole("progressbar", { name: "4 of 6 done" })).toBeVisible();
    expect(stepsIn(card)).toEqual([
      [words.steps.logo.title, routes.branding, ""],
      [words.steps["invoice-prefix"].title, profileSection("invoice-prefix"), ""],
    ]);
  });

  it("goes for that role once the steps it may finish are done, whatever the Staff step says", async () => {
    const api = stubApi({ "organization.setup.get": { data: checklistWith(["staff"]) } });
    const queryClient = newQueryClient();
    renderWithApi(<HomePage />, queryClient, member({ permissions: ["settings:manage"] }));
    // Asked, then answered.
    await waitFor(() => {
      expect(api.calls).toContain("organization.setup.get");
    });
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(usualHome)).toBeVisible();
  });

  it("lists the demo agency's one missing step, its logo", async () => {
    stubApi({ "organization.setup.get": { data: allButTheLogo } });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    const card = await screen.findByRole("region", { name: cardName });
    expect(within(card).getByText("6 of 7 done")).toBeVisible();
    expect(stepsIn(card)).toEqual([[words.steps.logo.title, routes.branding, ""]]);
  });

  it("goes once the last step is done, leaving the usual Home", async () => {
    const api = stubApi({ "organization.setup.get": { data: allButTheLogo } });
    const queryClient = newQueryClient();
    renderWithApi(<HomePage />, queryClient, member({ isOwner: true }));
    expect(await screen.findByRole("region", { name: cardName })).toBeVisible();
    // The logo is confirmed on the branding screen, which asks for the checklist again.
    api.answer("organization.setup.get", { data: finished });
    await queryClient.invalidateQueries();
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: cardName })).toBeNull();
    });
    expect(screen.getByText(usualHome)).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is never asked for on a Sales member's Home: their role can't change the settings", () => {
    const api = stubApi({ "organization.setup.get": { data: halfway } });
    renderWithApi(<HomePage />, newQueryClient(), ofStarterRole("sales"));
    expect(screen.getByText(messages.shell.home.nothingToSetUp)).toBeVisible();
    expect(screen.queryByRole("region")).toBeNull();
    expect(api.calls).toEqual([]);
  });

  it("shows the usual Home under its place while it loads", async () => {
    stubApi({ "organization.setup.get": "never" });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    expect(await screen.findByRole("status", { name: messages.common.loading })).toBeVisible();
    expect(screen.getByText(usualHome)).toBeVisible();
    expect(screen.getByRole("link", { name: messages.shell.home.settings })).toBeVisible();
  });

  it("says so above the usual Home if it didn't load, and tries again", async () => {
    const api = stubApi({ "organization.setup.get": { status: 500 } });
    renderWithApi(<HomePage />, newQueryClient(), member({ isOwner: true }));
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    expect(screen.getByText(usualHome)).toBeVisible();
    api.answer("organization.setup.get", { data: halfway });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("region", { name: cardName })).toBeVisible();
  });
});
