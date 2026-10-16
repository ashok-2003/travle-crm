// The console's platform staff (spec 5, 6.1), a super admin's alone: each person's level, whether two-factor is on and
// whether a temporary password is still to replace, the viewer marked "You" with no actions, and the removed apart.
// Support opening it is told it is a super admin's, and nothing is asked of the api.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffScreen } from "@/console/staff/staff-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { platformStaff } from "../../support/platform-staff";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "../plans/render-console";
import { arjun, kavita, meena, viewer } from "./people";

const { staff: words } = messages.consolePlatform;
const { levels } = messages.console;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StaffScreen", () => {
  it("shows each person's level, two-factor and a temporary password still to replace", async () => {
    screenIs("wide");
    stubApi({ "platform.platformStaff.list": { data: [kavita, arjun, meena] } });
    renderConsole(<StaffScreen />, viewer);
    const row = within(await screen.findByRole("row", { name: /Arjun Nair/ }));
    expect(row.getByText("arjun@platform.test")).toBeVisible();
    expect(row.getByText(levels.support)).toBeVisible();
    expect(row.getByText(words.twoFactorOff)).toBeVisible();
    expect(row.getByText(words.mustReplacePassword)).toBeVisible();
    expect(row.getByRole("button", { name: words.actionsFor.replace("{name}", "Arjun Nair") })).toBeVisible();

    const own = within(screen.getByRole("row", { name: /Kavita Rao/ }));
    expect(own.getByText(words.you)).toBeVisible();
    expect(own.getByText(levels["super-admin"])).toBeVisible();
    expect(own.getByText(words.twoFactorOn)).toBeVisible();
    expect(own.queryByRole("button")).toBeNull();

    const removed = within(screen.getByRole("region", { name: words.removedTitle }));
    expect(removed.getByText("Meena Pillai")).toBeVisible();
    expect(removed.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("row", { name: /Meena Pillai/ })).toHaveLength(1);
  });

  it("lists them on a phone", async () => {
    screenIs("phone");
    stubApi({ "platform.platformStaff.list": { data: [kavita, arjun] } });
    renderConsole(<StaffScreen />, viewer);
    const item = within((await screen.findByText("Arjun Nair")).closest("li") ?? document.body);
    expect(item.getByText(words.mustReplacePassword)).toBeVisible();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("tells support it is a super admin's, without asking the api", async () => {
    screenIs("wide");
    stubApi({ "platform.platformStaff.list": { data: [kavita, arjun] } });
    renderConsole(<StaffScreen />, platformStaff("support"));
    expect(await screen.findByText(messages.errors.reasons.SUPER_ADMIN_ONLY)).toBeVisible();
    expect(screen.queryByRole("button", { name: words.add })).toBeNull();
    expect(inputsTo("platformStaff.list")).toEqual([]);
  });

  it("says when the staff didn't load, and loads them on Try again", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.platformStaff.list": { status: 403 } });
    renderConsole(<StaffScreen />, viewer);
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("platform.platformStaff.list", { data: [kavita, arjun] });
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await screen.findByRole("row", { name: /Arjun Nair/ })).toBeVisible();
  });
});
