// The organization's members on its console page: each with role (Owners marked), email or none and last activity;
// support signs in as one after confirming (Better Auth's impersonate-user; the device's other tabs told, then the
// agency's app with a full load), the dialog held open meanwhile, a refusal said in it; and an Owner still to choose a
// password gets a new invite.
import type { OrganizationMember } from "@travel-crm/contracts/platform";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MembersSection } from "@/console/organizations/organization/members-section";
import type * as Session from "@/data/session";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi, type Answer } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { organizationDetails, organizationId } from "./organization-details";
import { inputsSentTo, renderConsoleScreen } from "./render";

const navigation = vi.hoisted(() => ({ loadPage: vi.fn() }));
vi.mock("@/lib/navigate", () => ({ loadPage: navigation.loadPage, replacePage: vi.fn() }));
const session = vi.hoisted(() => ({ announceSignOut: vi.fn() }));
vi.mock("@/data/session", async (importOriginal) => ({
  ...(await importOriginal<typeof Session>()),
  announceSignOut: session.announceSignOut,
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { members, impersonate } = messages.consoleOrganizations;
const { organization } = organizationDetails();

function member(overrides: Partial<OrganizationMember> = {}): OrganizationMember {
  return {
    memberId: "0199a000-0000-7000-8000-0000000000a1",
    userId: "0199a000-0000-7000-8000-0000000000b1",
    name: "Lakshmi Nair",
    roleName: "Owner",
    isOwner: true,
    email: "lakshmi@keralatrails.example",
    hasPassword: true,
    lastActiveAt: "2026-10-14T06:30:00.000Z",
    ...overrides,
  };
}

const ravi = member({
  memberId: "0199a000-0000-7000-8000-0000000000a2",
  userId: "0199a000-0000-7000-8000-0000000000b2",
  name: "Ravi",
  roleName: "Sales",
  isOwner: false,
  email: null,
  lastActiveAt: null,
});

const urlOf = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

function renderMembers(answers: Record<string, Answer>) {
  const api = stubApi(answers);
  renderConsoleScreen(<MembersSection organization={organization} />);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.loadPage.mockReset();
  session.announceSignOut.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("MembersSection", () => {
  it("lists each member with their role, email or none, and last activity", async () => {
    screenIs("wide");
    renderMembers({ "platform.organizations.members": { data: [member(), ravi] } });
    const owner = within((await screen.findByText("Lakshmi Nair")).closest("tr") ?? document.body);
    expect(owner.getByText("Owner")).toBeVisible();
    expect(owner.getByText("lakshmi@keralatrails.example")).toBeVisible();
    expect(owner.getByText("14 Oct")).toBeVisible();
    const sales = within(screen.getByText("Ravi").closest("tr") ?? document.body);
    expect(sales.getByText(members.noEmail)).toBeVisible();
    expect(sales.getByText(members.neverActive)).toBeVisible();
    expect(screen.queryByRole("button", { name: members.resendInvite })).toBeNull();
  });

  it("marks each Owner, under whatever name the agency gave the Owner role", async () => {
    screenIs("wide");
    const proprietor = member({ memberId: ravi.memberId, userId: ravi.userId, name: "Anil", roleName: "Proprietor" });
    renderMembers({ "platform.organizations.members": { data: [member(), proprietor, ravi] } });
    const owner = within((await screen.findByText("Lakshmi Nair")).closest("tr") ?? document.body);
    expect(owner.getAllByText(members.owner)).toHaveLength(1);
    const renamed = within(screen.getByText("Anil").closest("tr") ?? document.body);
    expect(renamed.getByText("Proprietor")).toBeVisible();
    expect(renamed.getByText(members.owner)).toBeVisible();
    expect(within(screen.getByText("Ravi").closest("tr") ?? document.body).queryByText(members.owner)).toBeNull();
  });

  it("signs support in as a member once confirmed, then opens the agency's app", async () => {
    screenIs("phone");
    renderMembers({
      "platform.organizations.members": { data: [member()] },
      "auth/admin/impersonate-user": { data: {} },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in as Lakshmi Nair" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Sign in as Lakshmi Nair?" });
    expect(dialog).toHaveTextContent("recorded in the organization's audit log and ends after an hour at most");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in as Lakshmi Nair" }));
    await vi.waitFor(() => {
      expect(navigation.loadPage).toHaveBeenCalledWith("/");
    });
    // The session is the member's now: the device's other tabs drop what they hold of support's first.
    expect(session.announceSignOut).toHaveBeenCalledOnce();
    expect(session.announceSignOut.mock.invocationCallOrder[0]).toBeLessThan(
      navigation.loadPage.mock.invocationCallOrder[0] ?? 0,
    );
    const sent = vi
      .mocked(globalThis.fetch)
      .mock.calls.find(([input]) => urlOf(input).endsWith("/api/auth/admin/impersonate-user"));
    expect(sent?.[1]?.body).toBe(JSON.stringify({ userId: member().userId }));
  });

  it("opens the agency's app even when the other tabs can't be told, reporting why", async () => {
    screenIs("wide");
    const reportError = vi.fn();
    vi.stubGlobal("reportError", reportError);
    const noChannel = new Error("BroadcastChannel is not allowed here");
    session.announceSignOut.mockImplementationOnce(() => {
      throw noChannel;
    });
    renderMembers({
      "platform.organizations.members": { data: [member()] },
      "auth/admin/impersonate-user": { data: {} },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in as Lakshmi Nair" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in as Lakshmi Nair" }));
    await vi.waitFor(() => {
      expect(navigation.loadPage).toHaveBeenCalledWith("/");
    });
    expect(reportError).toHaveBeenCalledWith(noChannel);
  });

  it("says why an impersonation was refused, and stays", async () => {
    screenIs("wide");
    renderMembers({
      "platform.organizations.members": { data: [member()] },
      "auth/admin/impersonate-user": { status: 403, reason: "IMPERSONATION_TARGET_NOT_A_MEMBER" },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in as Lakshmi Nair" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in as Lakshmi Nair" }));
    expect(await within(dialog).findByText(impersonate.notAMember.replace("{name}", "Lakshmi Nair"))).toBeVisible();
    expect(navigation.loadPage).not.toHaveBeenCalled();
  });

  /** The words the dialog shows for a refusal the side door gives, from errors.json. */
  const sentences: Record<string, string | undefined> = { ...messages.errors.reasons, ...messages.errors.auth };

  it.each(["SET_UP_TWO_FACTOR", "CHANGE_PASSWORD", "TARGET_HAS_PENDING_STEP"])(
    "says the side door's %s refusal in its own words, and stays",
    async (reason) => {
      screenIs("wide");
      renderMembers({
        "platform.organizations.members": { data: [member()] },
        "auth/admin/impersonate-user": { status: 403, reason },
      });
      await userEvent.click(await screen.findByRole("button", { name: "Sign in as Lakshmi Nair" }));
      const dialog = await screen.findByRole("alertdialog");
      await userEvent.click(within(dialog).getByRole("button", { name: "Sign in as Lakshmi Nair" }));
      expect(await within(dialog).findByText(sentences[reason] ?? `${reason}'s sentence in errors.json`)).toBeVisible();
      expect(session.announceSignOut).not.toHaveBeenCalled();
      expect(navigation.loadPage).not.toHaveBeenCalled();
    },
  );

  it("says when the api couldn't be reached, and stays", async () => {
    screenIs("wide");
    renderMembers({
      "platform.organizations.members": { data: [member()] },
      "auth/admin/impersonate-user": "offline",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in as Lakshmi Nair" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in as Lakshmi Nair" }));
    expect(await within(dialog).findByText(messages.errors.network)).toBeVisible();
  });

  it("keeps the confirmation open while signing in, Cancel off", async () => {
    screenIs("wide");
    const held = heldAnswer({ status: 403, reason: "SET_UP_TWO_FACTOR" });
    renderMembers({
      "platform.organizations.members": { data: [member()] },
      "auth/admin/impersonate-user": held.answer,
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sign in as Lakshmi Nair" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Sign in as Lakshmi Nair" }));
    expect(within(dialog).getByRole("button", { name: impersonate.starting })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: messages.common.cancel })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    held.release();
    expect(await within(dialog).findByText(messages.errors.reasons.SET_UP_TWO_FACTOR)).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.cancel }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("sends a new invite to an Owner who hasn't chosen a password", async () => {
    screenIs("wide");
    renderMembers({
      "platform.organizations.members": { data: [member({ hasPassword: false, lastActiveAt: null })] },
      "platform.organizations.resendInvite": { data: null },
    });
    expect(await screen.findByText(members.invitePending)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: members.resendInvite }));
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("A new invite is on its way to lakshmi@keralatrails.example.");
    });
    expect(inputsSentTo("organizations.resendInvite")).toEqual([{ organizationId, memberId: member().memberId }]);
  });

  it("says a refused invite's reason", async () => {
    screenIs("wide");
    renderMembers({
      "platform.organizations.members": { data: [member({ hasPassword: false })] },
      "platform.organizations.resendInvite": { status: 409, reason: "PASSWORD_ALREADY_SET" },
    });
    await userEvent.click(await screen.findByRole("button", { name: members.resendInvite }));
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(messages.errors.reasons.PASSWORD_ALREADY_SET);
    });
  });

  it("says when the members didn't load, and loads them on Try again", async () => {
    screenIs("wide");
    const api = renderMembers({ "platform.organizations.members": { status: 403 } });
    expect(await screen.findByText(members.loadFailed)).toBeVisible();
    api.answer("platform.organizations.members", { data: [] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByText(members.empty)).toBeVisible();
  });
});
