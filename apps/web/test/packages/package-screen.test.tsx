// The package page: the AI-sell switch is there for every kind of package, the group-only parts for a group trip.
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PackageScreen } from "@/packages/package-screen";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aPackage } from "./detail";

async function showing(kind: "custom" | "group") {
  const api = fakeApi();
  renderWithApi(<PackageScreen packageId={aPackage().id} />, newQueryClient());
  await waitFor(() => {
    expect(api.calls.some((call) => call.path === "packages.get")).toBe(true);
  });
  api.calls.find((call) => call.path === "packages.get")?.answer(aPackage({ kind }));
  await screen.findByRole("region", { name: messages.packages.sell.title });
}

describe("PackageScreen", () => {
  beforeEach(() => {
    screenIs("wide");
  });

  it("offers a custom package to the AI too", async () => {
    await showing("custom");
    expect(screen.getByRole("switch", { name: messages.packages.sell.label })).toBeTruthy();
    expect(screen.queryByRole("region", { name: messages.packages.seasons.title })).toBeNull();
    expect(screen.queryByRole("region", { name: messages.packages.payments.title })).toBeNull();
  });

  it("shows a group trip's seasons and payments as well", async () => {
    await showing("group");
    expect(screen.getByRole("switch", { name: messages.packages.sell.label })).toBeTruthy();
    expect(screen.getByRole("region", { name: messages.packages.seasons.title })).toBeTruthy();
    expect(screen.getByRole("region", { name: messages.packages.payments.title })).toBeTruthy();
  });
});
