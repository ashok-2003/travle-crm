// Step 1 of connecting a sheet (spec 6.5): the address with Copy, the instruction, the link field and Check the sheet,
// which makes the draft and goes on; each way the check fails has its sentence under the field (or above the button for
// the limit and a server without Google); the button is off while the subscription is read-only.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { sheetConnectStepRoute } from "@/lib/routes";
import { ShareStep } from "@/lead-sources/connect/share-step";
import { renderScreen, inputsTo } from "../../leads/screen";
import { routerCalls } from "../../leads/navigation";
import { stubApi } from "../../support/api-stub";
import { address, aSheetList, sheetId } from "../records";

vi.mock("next/navigation", () => import("../../leads/navigation"));

afterEach(() => {
  vi.unstubAllGlobals();
});

const words = messages.sheets.connect;
const link = "https://docs.google.com/spreadsheets/d/1vQ4kAbc/edit?gid=0";

function renderShare(begin: Parameters<typeof stubApi>[0][string] = { data: { sheetId } }) {
  const api = stubApi({ "leadSheets.list": { data: aSheetList() }, "leadSheets.begin": begin });
  renderScreen(<ShareStep />);
  return api;
}

describe("ShareStep", () => {
  it("shows the address with Copy, the instruction and the link field, and checks the sheet", async () => {
    renderShare();
    expect(screen.getByText(words.caption.replace("{step}", "1").replace("{name}", words.steps.share))).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: words.share.addressLabel })).toHaveValue(address);
    });
    expect(screen.getByRole("textbox", { name: words.share.addressLabel })).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: words.share.copyAddress.replace("{address}", address) })).toBeVisible();
    expect(screen.getByText(words.share.help)).toBeVisible();
    const check = screen.getByRole("button", { name: words.share.check });
    expect(check).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox", { name: words.share.linkLabel }), link);
    await userEvent.click(check);
    await waitFor(() => {
      expect(routerCalls.push).toHaveBeenCalledWith(sheetConnectStepRoute(sheetId));
    });
    expect(inputsTo("leadSheets.begin")).toEqual([{ link }]);
  });

  it.each([
    ["SHEET_LINK_INVALID", 400],
    ["SHEET_NOT_SHARED", 400],
    ["SHEET_NOT_GOOGLE_SHEET", 400],
    ["SHEET_EMPTY", 400],
    ["SHEET_ALREADY_CONNECTED", 409],
    ["SHEET_CLAIMED_ELSEWHERE", 409],
  ] as const)("says %s under the link field", async (reason, status) => {
    renderShare({ status, reason });
    await userEvent.type(screen.getByRole("textbox", { name: words.share.linkLabel }), link);
    await userEvent.click(screen.getByRole("button", { name: words.share.check }));
    const sentence = await screen.findByText(messages.errors.reasons[reason]);
    expect(sentence).toBeVisible();
    expect(screen.getByRole("textbox", { name: words.share.linkLabel })).toHaveAccessibleDescription(
      new RegExp(messages.errors.reasons[reason].slice(0, 20)),
    );
  });

  it.each(["SHEET_LIMIT_REACHED", "SHEETS_NOT_SET_UP", "SHEETS_NOT_IN_DEMO"] as const)(
    "says %s above the button, not under the field",
    async (reason) => {
      renderShare({ status: 403, reason });
      await userEvent.type(screen.getByRole("textbox", { name: words.share.linkLabel }), link);
      await userEvent.click(screen.getByRole("button", { name: words.share.check }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(messages.errors.reasons[reason]);
    },
  );

  it("names every address when there is more than one account", async () => {
    stubApi({
      "leadSheets.list": {
        data: aSheetList({ serviceAccountEmails: [address, "second@travelcrm-test.iam.gserviceaccount.com"] }),
      },
    });
    renderScreen(<ShareStep />);
    expect(await screen.findAllByRole("textbox", { name: words.share.addressLabel })).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 2, name: /any one of these addresses/ })).toBeVisible();
  });
});
