// "AI can sell" on a package: off with the gaps in words until the package is ready.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SellCard } from "@/packages/sell-card";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { aPackage } from "./detail";

const words = messages.packages.sell;

describe("SellCard", () => {
  it("the switch is off with the gaps listed until the package is ready", () => {
    renderWithApi(
      <SellCard detail={aPackage({ kind: "group", sellGaps: ["room_types", "advance"] })} />,
      newQueryClient(),
    );
    const toggle = screen.getByRole("switch", { name: words.label });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(words.gaps.room_types)).toBeTruthy();
    expect(screen.getByText(words.gaps.advance)).toBeTruthy();
  });

  it("turns on when nothing is missing", async () => {
    const api = fakeApi();
    renderWithApi(<SellCard detail={aPackage({ kind: "group" })} />, newQueryClient());
    await userEvent.click(screen.getByRole("switch", { name: words.label }));
    expect(api.last().path).toBe("packages.setSellable");
    expect(api.last().input).toEqual({ packageId: aPackage().id, sellable: true });
  });

  it("can always be turned off", () => {
    renderWithApi(
      <SellCard detail={aPackage({ kind: "group", sellable: true, sellGaps: ["prices"] })} />,
      newQueryClient(),
    );
    expect(screen.getByRole("switch", { name: words.label }).hasAttribute("disabled")).toBe(false);
  });
});
