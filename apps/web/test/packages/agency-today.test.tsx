// Today is the agency's day, in the organization's time zone, whatever day the browser is on.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgencyToday } from "@/packages/use-agency-today";
import { newQueryClient, renderWithApi } from "../organization/api";
import { member } from "../support/members";

function Today() {
  return <p>{useAgencyToday()}</p>;
}

function showIn(timeZone: string) {
  const me = member({ isOwner: true });
  renderWithApi(<Today />, newQueryClient(), { ...me, organization: { ...me.organization, timeZone } });
}

describe("useAgencyToday", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the next day where the agency's clock is far ahead of UTC", () => {
    showIn("Pacific/Kiritimati");
    expect(screen.getByText("2026-11-26")).toBeTruthy();
  });

  it("is the same day where the agency's clock is far behind", () => {
    showIn("Pacific/Pago_Pago");
    expect(screen.getByText("2026-11-25")).toBeTruthy();
  });
});
