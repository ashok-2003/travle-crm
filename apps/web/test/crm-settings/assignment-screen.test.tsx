// Settings > Lead assignment (release 4, spec 3.1): how new leads are given out and the pool for turns, the ordered
// rules (one whose person left is marked), the working days and hours, and the reply time; saved whole through
// useWriteAccess, refused with a reason while the subscription is read-only.
import type { AssignmentSettings } from "@travel-crm/contracts/crm";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentScreen } from "@/crm-settings/assignment/assignment-screen";
import { messages } from "@/i18n/messages";
import { paidSubscription } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { inputsTo, owner, renderScreen, salesperson } from "../leads/screen";

vi.mock("next/navigation", () => import("../leads/navigation"));

const words = messages.settings.assignment;
const priya = { userId: owner.user.id, name: "Priya Nair" };
const ravi = { userId: salesperson.user.id, name: "Ravi Kumar" };
const gone = "0199a000-0000-7000-8000-0000000000f9";
const NOW = new Date("2026-10-23T05:30:00Z");

const saved: AssignmentSettings = {
  mode: "owner",
  slowReplyMinutes: 15,
  workdays: 63,
  opensMinute: 600,
  closesMinute: 1140,
  rules: [],
  pool: [],
};

function renderSettings(settings: Partial<AssignmentSettings> = {}, options: Parameters<typeof renderScreen>[1] = {}) {
  const api = stubApi({
    "assignment.get": { data: { ...saved, ...settings } },
    "assignment.save": { data: null },
    "leads.owners": { data: [priya, ravi] },
    "destinations.search": { data: [] },
  });
  renderScreen(<AssignmentScreen />, { width: "wide", ...options });
  return api;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const saveButton = () => screen.findByRole("button", { name: words.save });

describe("AssignmentScreen", () => {
  it("shows the agency's settings: the Owner mode, no pool, Monday to Saturday 10:00 to 19:00, 15 minutes", async () => {
    renderSettings();
    expect(await screen.findByRole("radio", { name: new RegExp(words.mode.owner) })).toBeChecked();
    expect(screen.queryByText(words.pool.label)).not.toBeInTheDocument();
    expect(screen.getByLabelText(words.hours.opens)).toHaveValue("10:00");
    expect(screen.getByLabelText(words.hours.closes)).toHaveValue("19:00");
    const days = screen.getByRole("group", { name: words.hours.days });
    expect(within(days).getByRole("button", { name: "Saturday" })).toHaveAttribute("aria-pressed", "true");
    expect(within(days).getByRole("button", { name: "Sunday" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: words.slowReply.label })).toHaveTextContent("After 15 minutes");
    expect(screen.getByText(/Times are in Asia\/Kolkata/)).toBeVisible();
  });

  it("shows the pool for turns, warns when it is empty, and notes who is away", async () => {
    renderSettings({ mode: "turns", pool: [{ userId: ravi.userId, awayUntil: "2026-10-26T05:30:00.000Z" }] });
    expect(await screen.findByRole("checkbox", { name: "Ravi Kumar" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Priya Nair" })).not.toBeChecked();
    expect(screen.getByText("Away until 26 Oct")).toBeVisible();
    await userEvent.click(screen.getByRole("checkbox", { name: "Ravi Kumar" }));
    expect(screen.getByText(words.pool.empty)).toBeVisible();
  });

  it("marks a rule whose person left", async () => {
    renderSettings({
      rules: [
        {
          id: "r1",
          source: "web_form",
          destinationId: null,
          destinationName: null,
          tripType: null,
          assigneeUserId: gone,
        },
      ],
    });
    expect(await screen.findByText(words.rules.personLeft)).toBeVisible();
  });

  it("saves the whole of it: mode, pool, rules, days, hours and the wait", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("radio", { name: new RegExp(words.mode.turns) }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Priya Nair" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Ravi Kumar" }));
    await userEvent.click(screen.getByRole("button", { name: words.rules.add }));
    const rule = screen.getByRole("group", { name: "Rule 1" });
    await userEvent.click(within(rule).getByRole("combobox", { name: words.rules.source }));
    await userEvent.click(await screen.findByRole("option", { name: "Website form" }));
    await userEvent.click(within(rule).getByRole("combobox", { name: words.rules.person }));
    await userEvent.click(await screen.findByRole("option", { name: "Ravi Kumar" }));
    await userEvent.click(screen.getByRole("button", { name: "Sunday" }));
    await userEvent.click(screen.getByRole("button", { name: "Monday" }));
    const opens = screen.getByLabelText(words.hours.opens);
    await userEvent.clear(opens);
    await userEvent.type(opens, "09:30");
    await userEvent.click(screen.getByRole("combobox", { name: words.slowReply.label }));
    await userEvent.click(await screen.findByRole("option", { name: "After 1 hour" }));
    await userEvent.click(await saveButton());

    await waitFor(() => {
      expect(inputsTo("assignment.save")).toHaveLength(1);
    });
    expect(inputsTo("assignment.save")[0]).toEqual({
      mode: "turns",
      slowReplyMinutes: 60,
      // Monday off, Sunday on: bits 2 to 32 and 64.
      workdays: 2 + 4 + 8 + 16 + 32 + 64,
      opensMinute: 570,
      closesMinute: 1140,
      pool: expect.arrayContaining([priya.userId, ravi.userId]) as unknown,
      rules: [{ source: "web_form", destinationId: null, tripType: null, assigneeUserId: ravi.userId }],
    });
  });

  it("turns the reply alert off", async () => {
    renderSettings();
    await userEvent.click(await screen.findByRole("combobox", { name: words.slowReply.label }));
    await userEvent.click(await screen.findByRole("option", { name: words.slowReply.off }));
    await userEvent.click(await saveButton());
    await waitFor(() => {
      expect(inputsTo("assignment.save")).toHaveLength(1);
    });
    expect(inputsTo("assignment.save")[0]).toMatchObject({ slowReplyMinutes: null });
  });

  it("refuses closing before opening on the field, and sends nothing", async () => {
    renderSettings();
    const closes = await screen.findByLabelText(words.hours.closes);
    await userEvent.clear(closes);
    await userEvent.type(closes, "09:00");
    await userEvent.click(await saveButton());
    expect(await screen.findByText(words.problems.closing)).toBeVisible();
    expect(inputsTo("assignment.save")).toEqual([]);
  });

  it("turns Save off while the subscription is read-only, saying why", async () => {
    renderSettings({}, { subscription: { ...paidSubscription, access: "read_only" } });
    const button = await saveButton();
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(messages.errors.reasons.ORGANIZATION_READ_ONLY);
  });

  it("says when the settings didn't load, with Try again", async () => {
    const api = renderSettings();
    api.answer("assignment.get", { status: 500 });
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
  });
});
