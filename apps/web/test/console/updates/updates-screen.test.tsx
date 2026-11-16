// Platform updates (the owner, 2026-11-17): the system's health moved here from the dashboard, for all platform staff,
// with, for a super admin only, whether platform alerts reach this device.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatesScreen } from "@/console/updates/updates-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { renderConsole } from "../../support/render-console";

const device = vi.hoisted(() => ({ pushState: vi.fn(), turnPushOn: vi.fn(), turnPushOff: vi.fn() }));
vi.mock("@/notifications/push/push-device", () => device);

const { push } = messages.notifications;

let api: ReturnType<typeof stubApi>;

beforeEach(() => {
  device.pushState.mockResolvedValue("off");
  api = stubApi({
    "platform.dashboard.incidents": { data: { open: [], recent: [] } },
    "platform.push.publicKey": { data: "key" },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UpdatesScreen", () => {
  it("shows the system's health and a super admin's platform alerts control", async () => {
    renderConsole(<UpdatesScreen />, platformStaff("super-admin"));
    expect(screen.getByRole("heading", { name: messages.console.updates.title })).toBeVisible();
    expect(await screen.findByText(messages.console.health.allWorking)).toBeVisible();
    expect(await screen.findByRole("heading", { name: push.platformHeading })).toBeVisible();
    expect(await screen.findByRole("button", { name: push.turnOn })).toBeVisible();
  });

  it("shows support the health and no platform alerts control", async () => {
    renderConsole(<UpdatesScreen />, platformStaff("support"));
    expect(await screen.findByText(messages.console.health.allWorking)).toBeVisible();
    expect(screen.queryByRole("heading", { name: push.platformHeading })).toBeNull();
  });

  it("shows no platform alerts control when the console has no push keys", async () => {
    api.answer("platform.push.publicKey", { data: "" });
    renderConsole(<UpdatesScreen />, platformStaff("super-admin"));
    expect(await screen.findByText(messages.console.health.allWorking)).toBeVisible();
    await vi.waitFor(() => {
      expect(api.calls).toContain("platform.push.publicKey");
    });
    expect(screen.queryByRole("heading", { name: push.platformHeading })).toBeNull();
  });
});
