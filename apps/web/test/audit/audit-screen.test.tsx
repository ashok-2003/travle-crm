// The audit log screen (spec 9.5): every change newest first, a page at a time, each with what happened as a
// sentence, who did it (named by the api), when in the organization's zone, where from, and its before and after as
// stored; one record's history when the address names one; and honest loading, empty and error states, a refusal
// saying its reason.
import type { AuditLogEntry } from "@travel-crm/contracts/audit";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditScreen } from "@/audit/audit-screen";
import { messages } from "@/i18n/messages";
import { formatDay, formatTime } from "@/lib/format";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { newQueryClient, renderWithApi } from "../organization/api";

const navigation = vi.hoisted(() => ({ search: "" }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const { audit, common, errors, roles } = messages;
const viewer = member({ isOwner: true });
/** The zone the screen shows times in: the viewer's organization's. */
const { timeZone } = viewer.organization;
const roleId = "0199a000-0000-7000-8000-0000000000b1";

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "0199a000-0000-7000-8000-0000000000a1",
    occurredAt: "2026-10-14T11:00:00.000Z",
    source: "web",
    action: "role.updated",
    entityType: "role",
    entityId: roleId,
    before: { name: "Sales", permissions: [{ permission: "leads:view", scope: "own" }] },
    after: {
      name: "Sales",
      permissions: [
        { permission: "leads:view", scope: "own" },
        { permission: "audit:view", scope: null },
      ],
    },
    actor: { kind: "member", name: "Asha Sharma" },
    ...overrides,
  };
}

const page = (entries: AuditLogEntry[], nextCursor: string | null = null) => ({ data: { entries, nextCursor } });

function renderScreen() {
  return renderWithApi(<AuditScreen />, newQueryClient(), viewer);
}

/** The entries as listed, each one's text. */
async function listed(): Promise<string[]> {
  const list = await screen.findByRole("list", { name: audit.entries });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

/** The inputs the screen's calls sent, read from the stubbed fetch's URLs. */
function inputsSent(): unknown[] {
  return vi.mocked(globalThis.fetch).mock.calls.map(([input]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost");
    return (JSON.parse(url.searchParams.get("input") ?? "{}") as Record<string, unknown>)["0"];
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  navigation.search = "";
});

describe("AuditScreen", () => {
  it("lists each change newest first, as the api gives them: what, who, when in the organization's zone, and where from", async () => {
    stubApi({
      "audit.list": page([
        entry(),
        entry({
          id: "0199a000-0000-7000-8000-0000000000a2",
          occurredAt: "2025-03-01T04:00:00.000Z",
          action: "staff.removed",
          source: "impersonation",
          actor: { kind: "support-as-member", name: "Asha Sharma" },
        }),
      ]),
    });
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: audit.title })).toBeVisible();
    const [first, second] = await listed();
    const recent = new Date("2026-10-14T11:00:00.000Z");
    const older = new Date("2025-03-01T04:00:00.000Z");
    expect(first).toContain(audit.actions.role.updated);
    expect(first).toContain("Asha Sharma");
    expect(first).toContain(`${formatDay(recent, { timeZone })}, ${formatTime(recent, { timeZone })}`);
    expect(first).toContain(audit.sources.web);
    expect(second).toContain(audit.actions.staff.removed);
    expect(second).toContain("Support, as Asha Sharma");
    expect(second).toContain(`${formatDay(older, { timeZone })}, ${formatTime(older, { timeZone })}`);
    expect(second).toContain(audit.sources.impersonation);
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-10-14T11:00:00.000Z");
  });

  it("names who acted: support itself, the platform team, the system, and anyone no longer a member", async () => {
    const by = (actor: AuditLogEntry["actor"], index: number) =>
      entry({ id: `0199a000-0000-7000-8000-00000000000${String(index)}`, actor });
    stubApi({
      "audit.list": page([
        by({ kind: "support" }, 1),
        by({ kind: "platform" }, 2),
        by({ kind: "system" }, 3),
        by({ kind: "member", name: null }, 4),
        by({ kind: "support-as-member", name: null }, 5),
      ]),
    });
    renderScreen();
    const items = await listed();
    expect(items[0]).toContain(`${audit.actors.support} ·`);
    expect(items[1]).toContain(audit.actors.platform);
    expect(items[2]).toContain(audit.actors.system);
    expect(items[3]).toContain(audit.actors.formerMember);
    expect(items[4]).toContain(audit.actors.supportAsFormerMember);
  });

  /** The entry's title, which opens what changed. */
  const opener = (action: string) =>
    screen.getByRole("button", { name: audit.change.open.replace("{action}", action) });
  const changeOpenedBy = (button: HTMLElement) =>
    within(document.getElementById(button.getAttribute("aria-controls") ?? "") ?? document.body);

  it("opens what changed from the entry's title, in words, a setting as before and after", async () => {
    stubApi({
      "audit.list": page([
        entry({
          action: "settings.two-factor-requirement-changed",
          entityType: "organization",
          before: { requireTwoFactor: false },
          after: { requireTwoFactor: true },
        }),
      ]),
    });
    renderScreen();
    await listed();
    const setting = opener(audit.actions.settings["two-factor-requirement-changed"]);
    expect(setting).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(audit.fields.requireTwoFactor)).toBeNull();

    await userEvent.click(setting);
    expect(setting).toHaveAttribute("aria-expanded", "true");
    const change = changeOpenedBy(setting);
    expect(change.getByText(audit.fields.requireTwoFactor)).toBeVisible();
    expect(change.getByText(audit.change.no)).toBeVisible();
    expect(change.getByText(audit.change.yes)).toBeVisible();

    await userEvent.click(setting);
    expect(screen.queryByText(audit.fields.requireTwoFactor)).toBeNull();
  });

  it("shows a role's change as what it gained and lost, by the permissions' labels, and nothing unchanged", async () => {
    stubApi({
      "audit.list": page([
        entry({
          before: {
            name: "Sales",
            permissions: [
              { permission: "leads:view", scope: "own" },
              { permission: "staff:manage", scope: null },
            ],
          },
          after: {
            name: "Sales",
            permissions: [
              { permission: "leads:view", scope: "own" },
              { permission: "audit:view", scope: null },
            ],
          },
        }),
      ]),
    });
    renderScreen();
    await listed();
    const updated = opener(audit.actions.role.updated);
    await userEvent.click(updated);
    const change = changeOpenedBy(updated);
    expect(change.getByText(audit.fields.permissions)).toBeVisible();
    expect(change.getByText(audit.change.added).parentElement).toHaveTextContent(roles.permissions["audit:view"]);
    expect(change.getByText(audit.change.removed).parentElement).toHaveTextContent(roles.permissions["staff:manage"]);
    // The name didn't change, nor did the grant both sides hold: neither shows, nor any raw key.
    expect(change.queryByText(audit.fields.name)).toBeNull();
    expect(change.queryByText(/leads:view|audit:view|scope/)).toBeNull();
    expect(change.queryByText(new RegExp(roles.permissions["leads:view"]))).toBeNull();
  });

  it("names a grant's scope, and a role made from nothing as only what it was given", async () => {
    stubApi({ "audit.list": page([entry({ action: "role.created", before: null })]) });
    renderScreen();
    await listed();
    const created = opener(audit.actions.role.created);
    await userEvent.click(created);
    const change = changeOpenedBy(created);
    expect(change.getByText(`${roles.permissions["leads:view"]} (${roles.editor.scopeOwn})`)).toBeVisible();
    expect(change.queryByText(audit.change.removed)).toBeNull();
    // A field that isn't a list, from nothing: before is None.
    expect(change.getByText(audit.fields.name)).toBeVisible();
    expect(change.getByText(audit.change.none)).toBeVisible();
  });

  it("offers nothing to open for a change that recorded none, or none that changed", async () => {
    stubApi({
      "audit.list": page([
        entry({ action: "staff.password-reset", before: null, after: null }),
        entry({ id: "0199a000-0000-7000-8000-0000000000a2", before: { name: "Sales" }, after: { name: "Sales" } }),
      ]),
    });
    renderScreen();
    await listed();
    expect(screen.queryByRole("button", { name: /see what changed/ })).toBeNull();
  });

  it("reads an action recorded before its sentence was written as words", async () => {
    stubApi({ "audit.list": page([entry({ action: "booking-note.archived" })]) });
    renderScreen();
    expect((await listed())[0]).toContain("Booking note archived");
  });

  it("leads to one record's history, then shows only it, with a way back to every change", async () => {
    stubApi({ "audit.list": page([entry()]) });
    const { unmount } = renderScreen();
    const link = await screen.findByRole("link", { name: "This role's history" });
    expect(link).toHaveAttribute("href", `/settings/audit?entityType=role&entityId=${roleId}`);
    unmount();

    navigation.search = `entityType=role&entityId=${roleId}`;
    renderScreen();
    await listed();
    expect(screen.getByText("The history of one role")).toBeVisible();
    expect(screen.getByRole("link", { name: audit.showEverything })).toHaveAttribute("href", "/settings/audit");
    expect(screen.queryByRole("link", { name: "This role's history" })).toBeNull();
    expect(inputsSent().at(-1)).toEqual({ entityType: "role", entityId: roleId, limit: 25 });
  });

  it("shows the whole log when the address names no proper record", async () => {
    navigation.search = "entityType=Role&entityId=nope";
    stubApi({ "audit.list": page([entry()]) });
    renderScreen();
    await listed();
    expect(inputsSent()).toEqual([{ limit: 25 }]);
    expect(screen.queryByRole("link", { name: audit.showEverything })).toBeNull();
  });

  it("shows older changes below when asked, after the last entry shown", async () => {
    const first = entry();
    const older = entry({ id: "0199a000-0000-7000-8000-0000000000a0", action: "role.created", before: null });
    const api = stubApi({ "audit.list": page([first], first.id) });
    renderScreen();
    await listed();
    api.answer("audit.list", page([older]));
    await userEvent.click(screen.getByRole("button", { name: audit.showMore }));
    await vi.waitFor(async () => {
      expect(await listed()).toHaveLength(2);
    });
    expect((await listed())[1]).toContain(audit.actions.role.created);
    expect(inputsSent()).toEqual([{ limit: 25 }, { limit: 25, before: first.id }]);
    expect(screen.queryByRole("button", { name: audit.showMore })).toBeNull();
  });

  it("says when the older changes didn't load, keeping the ones shown", async () => {
    const first = entry();
    const api = stubApi({ "audit.list": page([first], first.id) });
    renderScreen();
    await listed();
    api.answer("audit.list", { status: 500 });
    await userEvent.click(screen.getByRole("button", { name: audit.showMore }));
    expect(await screen.findByText(audit.moreFailed)).toBeVisible();
    expect(await listed()).toHaveLength(1);
    expect(screen.getByRole("button", { name: audit.showMore })).toBeEnabled();
  });

  it("says why the api refused the log, or the older changes", async () => {
    const api = stubApi({ "audit.list": { status: 403, reason: "MISSING_PERMISSION" } });
    const { unmount } = renderScreen();
    expect(await screen.findByText(errors.reasons.MISSING_PERMISSION)).toBeVisible();
    expect(screen.queryByText(audit.loadFailed)).toBeNull();
    unmount();

    const first = entry();
    api.answer("audit.list", page([first], first.id));
    renderScreen();
    await listed();
    api.answer("audit.list", { status: 403, reason: "ORGANIZATION_CANCELLED" });
    await userEvent.click(screen.getByRole("button", { name: audit.showMore }));
    expect(await screen.findByText(errors.reasons.ORGANIZATION_CANCELLED)).toBeVisible();
    expect(screen.queryByText(audit.moreFailed)).toBeNull();
  });

  it("says when nothing has been recorded, and when one record has no history", async () => {
    stubApi({ "audit.list": page([]) });
    const { unmount } = renderScreen();
    expect(await screen.findByText(audit.empty)).toBeVisible();
    unmount();
    navigation.search = `entityType=role&entityId=${roleId}`;
    renderScreen();
    expect(await screen.findByText(audit.emptyRecord)).toBeVisible();
  });

  it("says when the audit log didn't load, and loads it on Try again", async () => {
    const api = stubApi({ "audit.list": { status: 500 } });
    renderScreen();
    expect(await screen.findByText(audit.loadFailed)).toBeVisible();
    api.answer("audit.list", page([entry()]));
    await userEvent.click(screen.getByRole("button", { name: common.tryAgain }));
    expect(await listed()).toHaveLength(1);
  });

  it("shows a labelled skeleton while the log loads", async () => {
    stubApi({ "audit.list": "never" });
    renderScreen();
    expect(await screen.findByRole("status", { name: common.loading })).toHaveAttribute("aria-busy", "true");
  });
});
