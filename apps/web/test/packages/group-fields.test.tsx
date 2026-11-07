// The group-trip fields of the package editor: only a group package shows them, and what is typed is sent back.
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PackageForm } from "@/packages/package-form";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { aPackage } from "./detail";

const words = messages.packages.form;

describe("the package form's group fields", () => {
  it("group fields appear only for a group package", () => {
    const { unmount } = renderWithApi(<PackageForm detail={aPackage()} />, newQueryClient());
    expect(screen.queryByRole("group", { name: words.roomTypes })).toBeNull();
    expect(screen.queryByLabelText(words.startCity)).toBeNull();
    unmount();
    renderWithApi(<PackageForm detail={aPackage({ kind: "group" })} />, newQueryClient());
    expect(screen.getByRole("group", { name: words.roomTypes })).toBeTruthy();
    expect(screen.getByLabelText(words.startCity)).toBeTruthy();
    expect(screen.getByRole("switch", { name: words.pricesIncludeGst })).toBeTruthy();
  });

  it("turning a package into a group trip shows the fields", async () => {
    renderWithApi(<PackageForm detail={aPackage()} />, newQueryClient());
    await userEvent.click(screen.getByRole("radio", { name: words.kinds.group }));
    expect(screen.getByLabelText(words.startCity)).toBeTruthy();
  });

  it("sends the chosen room types and the typed start city", async () => {
    const api = fakeApi();
    renderWithApi(<PackageForm detail={aPackage({ kind: "group" })} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: words.roomTypeNames.double }));
    await userEvent.type(screen.getByLabelText(words.startCity), "Delhi");
    await userEvent.click(screen.getByRole("button", { name: words.save }));
    await vi_waitForCall(api);
    const sent = api.last().input as { roomTypes: string[]; startCity: string; kind: string };
    expect(sent.roomTypes).toEqual(["double"]);
    expect(sent.startCity).toBe("Delhi");
    expect(sent.kind).toBe("group");
  });
});

async function vi_waitForCall(api: ReturnType<typeof fakeApi>) {
  await screen.findByRole("button", { name: words.saving });
  expect(api.calls.some((call) => call.path === "packages.update")).toBe(true);
}
