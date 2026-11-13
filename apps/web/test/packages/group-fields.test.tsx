// The group-trip fields of the package editor: only a group package shows them, and what is typed is sent back.
// Clearing the advance of the only package a switched-on AI agent sells warns that the agent then answers no chat.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PackageForm } from "@/packages/package-form";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
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

describe("the advance of the only package the AI agent sells", () => {
  const onSale = aPackage({ kind: "group", sellable: true, sellGaps: [], advancePerPersonPaise: 200_000 });
  /** The agent's setup as the api says: on or off, with this many packages it may sell. */
  const setup = (on: boolean, count: number) => ({
    steps: [{ key: "packages", done: count > 0, optional: false, count, total: 0 }],
    ready: true,
    on,
    pausedBySupport: false,
  });
  /** Clears the advance once the agent's setup has loaded. */
  const clearAdvance = async (on: boolean, count: number) => {
    const { calls } = stubApi({ "ai.agentSetup": { data: setup(on, count) } });
    const queryClient = newQueryClient();
    renderWithApi(<PackageForm detail={onSale} />, queryClient);
    await waitFor(() => {
      expect(calls).toContain("ai.agentSetup");
      expect(queryClient.isFetching()).toBe(0);
    });
    await userEvent.clear(screen.getByLabelText(words.advancePerPerson));
  };

  it("warns that the agent stops answering every chat", async () => {
    await clearAdvance(true, 1);
    expect(await screen.findByText(words.advanceOnlyOnSale)).toBeVisible();
  });

  it("says nothing while another package is on sale", async () => {
    await clearAdvance(true, 2);
    expect(screen.queryByText(words.advanceOnlyOnSale)).toBeNull();
  });

  it("says nothing while the agent is off", async () => {
    await clearAdvance(false, 1);
    expect(screen.queryByText(words.advanceOnlyOnSale)).toBeNull();
  });
});
