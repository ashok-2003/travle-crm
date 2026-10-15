// Push on this device, on the notification choices' page (spec 9.4): it says whether this browser gets pushes, turns
// them on and off, says plainly why it can't where it can't (no push in this browser, no service worker, notifications
// blocked) and when turning on failed, and offers support impersonating the person no way to turn it on.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import { PushOnThisDevice } from "@/notifications/push/push-on-this-device";
import { newQueryClient, renderWithApi } from "../organization/api";
import { member } from "../support/members";

const device = vi.hoisted(() => ({ pushState: vi.fn(), turnPushOn: vi.fn(), turnPushOff: vi.fn() }));
vi.mock("@/notifications/push/push-device", () => device);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { push } = messages.notifications;
const t = createTranslator({ locale, messages, namespace: "notifications.push" });

function renderPush(me = member({ name: "Asha" })) {
  renderWithApi(<PushOnThisDevice />, newQueryClient(), me);
}

beforeEach(() => {
  for (const call of Object.values(device)) call.mockReset();
  toast.error.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PushOnThisDevice", () => {
  it("turns push on, and says it is on", async () => {
    device.pushState.mockResolvedValue("off");
    device.turnPushOn.mockResolvedValue("on");
    renderPush();
    expect(await screen.findByText(push.off)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: push.turnOn }));
    expect(await screen.findByText(push.on)).toBeVisible();
    expect(screen.getByRole("button", { name: push.turnOff })).toBeVisible();
    expect(device.turnPushOn).toHaveBeenCalledOnce();
  });

  it("turns push off again", async () => {
    device.pushState.mockResolvedValue("on");
    device.turnPushOff.mockResolvedValue("off");
    renderPush();
    await userEvent.click(await screen.findByRole("button", { name: push.turnOff }));
    expect(await screen.findByRole("button", { name: push.turnOn })).toBeVisible();
  });

  it.each([
    ["unsupported", push.unsupported],
    ["no-worker", push.noWorker],
    ["blocked", push.blocked],
  ] as const)("says why push can't be turned on: %s", async (state, sentence) => {
    device.pushState.mockResolvedValue(state);
    renderPush();
    expect(await screen.findByText(sentence)).toBeVisible();
    expect(screen.queryByRole("button", { name: push.turnOn })).toBeNull();
  });

  it("says so when the browser couldn't turn push on, and stays off", async () => {
    device.pushState.mockResolvedValue("off");
    device.turnPushOn.mockRejectedValue(new DOMException("Registration failed", "AbortError"));
    renderPush();
    await userEvent.click(await screen.findByRole("button", { name: push.turnOn }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(push.failed, expect.anything());
    });
    expect(screen.getByRole("button", { name: push.turnOn })).toBeEnabled();
  });

  it("offers support impersonating the person no way to turn push on", async () => {
    device.pushState.mockResolvedValue("off");
    renderPush(member({ name: "Asha", impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" }));
    expect(await screen.findByText(t("impersonating", { name: "Asha" }))).toBeVisible();
    expect(screen.getByRole("button", { name: push.turnOn })).toBeDisabled();
  });
});
