// System health: the dashboard says what is broken now (or that all is working) and links to the past week's incidents,
// which the Health page lists with what is broken now, so the dashboard stays short.
import type { PlatformIncident } from "@travel-crm/contracts/platform";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleProviders } from "@/console/data/console-providers";
import { SystemHealth } from "@/console/dashboard/system-health";
import { HealthScreen } from "@/console/health/health-screen";
import { consoleRoutes } from "@/console/routes";
import { locale, messages } from "@/i18n/messages";
import { stubApi } from "../support/api-stub";

const { health } = messages.console;

const resolved: PlatformIncident = {
  id: "0199a000-0000-7000-8000-0000000000c1",
  kind: "ai.unavailable",
  detail: "",
  openedAt: "2026-11-06T13:00:00.000Z",
  lastSeenAt: "2026-11-06T16:30:00.000Z",
  resolvedAt: "2026-11-06T16:30:00.000Z",
  reports: 3,
};

function renderIn(ui: React.ReactNode, recent: PlatformIncident[]) {
  stubApi({ "platform.dashboard.incidents": { data: { open: [], recent } } });
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ConsoleProviders>{ui}</ConsoleProviders>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("system health on the dashboard", () => {
  it("says all is working and links to the past week's incidents, without listing them", async () => {
    renderIn(<SystemHealth />, [resolved]);
    expect(await screen.findByText(health.allWorking)).toBeVisible();
    expect(screen.getByRole("link", { name: /Past incidents/ })).toHaveAttribute("href", consoleRoutes.health);
    expect(screen.queryByText(health.kinds.aiUnavailable.title)).toBeNull();
  });
});

describe("the Health page", () => {
  it("lists the incidents resolved in the last week", async () => {
    renderIn(<HealthScreen />, [resolved]);
    expect(await screen.findByText(health.kinds.aiUnavailable.title)).toBeVisible();
    expect(screen.getByRole("heading", { level: 2, name: health.recent })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Past incidents/ })).toBeNull();
  });

  it("says when nothing broke in the last week", async () => {
    renderIn(<HealthScreen />, []);
    expect(await screen.findByText(health.noneRecent)).toBeVisible();
  });
});
