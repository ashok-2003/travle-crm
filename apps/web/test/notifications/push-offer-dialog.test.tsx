// The pop-up that asks to turn push on (the owner, 2026-11-17): shown on a device whose push is off, right after a
// sign-in or once a day; "Not now" hides it until tomorrow; "Turn on" asks the browser and the api; never shown where
// push can't work, is on, or support is signed in as the member.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { locale, messages } from "@/i18n/messages";
import type { PushApi } from "@/notifications/push/push-api";
import { AgencyPushOffer } from "@/notifications/push/agency-push-offer";
import { PushOfferDialog } from "@/notifications/push/push-offer-dialog";
import {
  localDay,
  markOffered,
  markSignedIn,
  rememberTurnedOffByChoice,
  wasOfferedOn,
} from "@/notifications/push/push-offer";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { member } from "../support/members";

const device = vi.hoisted(() => ({
  pushState: vi.fn(),
  subscribeQuietly: vi.fn(),
  turnPushOn: vi.fn(),
  turnPushOff: vi.fn(),
}));
vi.mock("@/notifications/push/push-device", () => device);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { offer } = messages.notifications.push;
const api: PushApi = {
  publicKey: () => Promise.resolve("key"),
  subscribe: () => Promise.resolve(),
  unsubscribe: () => Promise.resolve(),
};

function renderOffer(platform = false) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PushOfferDialog api={api} platform={platform} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  screenIs("wide");
  for (const call of Object.values(device)) call.mockReset();
  device.subscribeQuietly.mockResolvedValue(false);
  toast.success.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("PushOfferDialog", () => {
  it("asks on a device whose push is off, and records the day it asked", async () => {
    device.pushState.mockResolvedValue("off");
    renderOffer();
    expect(await screen.findByRole("dialog", { name: offer.title })).toBeVisible();
    expect(wasOfferedOn()).toBe(localDay());
  });

  it("says platform alerts in the console's words", async () => {
    device.pushState.mockResolvedValue("off");
    renderOffer(true);
    expect(await screen.findByRole("dialog", { name: offer.platformTitle })).toBeVisible();
  });

  it("hides on Not now, and doesn't ask again the same day", async () => {
    device.pushState.mockResolvedValue("off");
    const first = renderOffer();
    await userEvent.click(await screen.findByRole("button", { name: offer.notNow }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    first.unmount();
    renderOffer();
    await waitFor(() => {
      expect(device.pushState).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks again the next day", async () => {
    markOffered("2020-01-01");
    device.pushState.mockResolvedValue("off");
    renderOffer();
    expect(await screen.findByRole("dialog", { name: offer.title })).toBeVisible();
  });

  it("asks right after a sign-in even when it asked today, once", async () => {
    markOffered(localDay());
    markSignedIn();
    device.pushState.mockResolvedValue("off");
    renderOffer();
    expect(await screen.findByRole("dialog", { name: offer.title })).toBeVisible();
  });

  it.each(["unsupported", "blocked", "on"] as const)("never asks when push is %s", async (state) => {
    markSignedIn();
    device.pushState.mockResolvedValue(state);
    renderOffer();
    await waitFor(() => {
      expect(device.pushState).toHaveBeenCalled();
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("subscribes by itself, and never asks, when the browser already allows notifications", async () => {
    markSignedIn();
    device.pushState.mockResolvedValue("off");
    device.subscribeQuietly.mockResolvedValue(true);
    renderOffer();
    await waitFor(() => {
      expect(device.subscribeQuietly).toHaveBeenCalledWith(api);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks as before when that quiet subscribe fails, and when permission is not granted", async () => {
    markSignedIn();
    device.pushState.mockResolvedValue("off");
    device.subscribeQuietly.mockResolvedValue(false);
    renderOffer();
    expect(await screen.findByRole("dialog", { name: offer.title })).toBeVisible();
  });

  it("does not subscribe by itself after the person turned push off, and asks at most once a day", async () => {
    rememberTurnedOffByChoice();
    markOffered(localDay());
    device.pushState.mockResolvedValue("off");
    device.subscribeQuietly.mockResolvedValue(true);
    renderOffer();
    await waitFor(() => {
      expect(device.pushState).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(device.subscribeQuietly).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks again the next day after the person turned push off", async () => {
    rememberTurnedOffByChoice();
    markOffered("2020-01-01");
    device.pushState.mockResolvedValue("off");
    renderOffer();
    expect(await screen.findByRole("dialog", { name: offer.title })).toBeVisible();
    expect(device.subscribeQuietly).not.toHaveBeenCalled();
  });

  it("turns push on inside the tap, then closes and says so", async () => {
    device.pushState.mockResolvedValue("off");
    device.turnPushOn.mockResolvedValue("on");
    renderOffer();
    await userEvent.click(await screen.findByRole("button", { name: offer.turnOn }));
    expect(device.turnPushOn).toHaveBeenCalledWith(api);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(toast.success).toHaveBeenCalledWith(offer.turnedOn);
  });

  it("says how to allow notifications when the browser says no", async () => {
    device.pushState.mockResolvedValue("off");
    device.turnPushOn.mockResolvedValue("blocked");
    renderOffer();
    await userEvent.click(await screen.findByRole("button", { name: offer.turnOn }));
    expect(await screen.findByText(offer.blocked)).toBeVisible();
    expect(screen.queryByRole("button", { name: offer.turnOn })).toBeNull();
  });

  it("stays open and enabled when turning on failed", async () => {
    device.pushState.mockResolvedValue("off");
    device.turnPushOn.mockRejectedValue(new DOMException("no", "AbortError"));
    renderOffer();
    await userEvent.click(await screen.findByRole("button", { name: offer.turnOn }));
    await waitFor(() => {
      expect(device.turnPushOn).toHaveBeenCalledOnce();
    });
    expect(await screen.findByRole("button", { name: offer.turnOn })).toBeEnabled();
  });
});

describe("AgencyPushOffer", () => {
  it("is never shown to support signed in as a member", async () => {
    device.pushState.mockResolvedValue("off");
    renderWithApi(
      <AgencyPushOffer />,
      newQueryClient(),
      member({ impersonatedBy: "0199a000-0000-7000-8000-0000000000ad" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(device.pushState).not.toHaveBeenCalled();
  });

  it("is shown to a member", async () => {
    device.pushState.mockResolvedValue("off");
    renderWithApi(<AgencyPushOffer />, newQueryClient(), member());
    expect(await screen.findByRole("dialog", { name: offer.title })).toBeVisible();
  });
});
