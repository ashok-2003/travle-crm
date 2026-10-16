// A super admin's actions on someone else of the platform staff: change their level, give them a new temporary
// password (shown once), or remove them once confirmed. Each refusal shows its sentence, the last super admin's
// among them.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffScreen } from "@/console/staff/staff-screen";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "../plans/render-console";
import { CacheProbe, mutationsHeld } from "./cache-probe";
import { arjun, kavita, person, viewer } from "./people";
import { heldAnswer } from "../../support/api-stub";

const { staff: words } = messages.consolePlatform;
const { levels } = messages.console;

async function act(action: string, people = [kavita, arjun], name = "Arjun Nair") {
  screenIs("wide");
  const api = stubApi({ "platform.platformStaff.list": { data: people } });
  renderConsole(
    <>
      <StaffScreen />
      <CacheProbe />
    </>,
    viewer,
  );
  await userEvent.click(await screen.findByRole("button", { name: words.actionsFor.replace("{name}", name) }));
  await userEvent.click(screen.getByRole("menuitem", { name: action }));
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("acting on platform staff", () => {
  it("changes someone's level", async () => {
    const api = await act(words.changeLevel.action);
    const dialog = within(
      screen.getByRole("dialog", { name: words.changeLevel.title.replace("{name}", "Arjun Nair") }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: levels["super-admin"] }));
    api.answer("platform.platformStaff.setLevel", { data: null });
    await userEvent.click(dialog.getByRole("button", { name: words.changeLevel.submit }));
    expect(
      await screen.findByText(
        words.changeLevel.changed.replace("{name}", "Arjun Nair").replace("{level}", levels["super-admin"]),
      ),
    ).toBeVisible();
    expect(inputsTo("platformStaff.setLevel")).toEqual([{ userId: arjun.userId, level: "super-admin" }]);
  });

  it("shows why the last super admin can't be demoted", async () => {
    const rahul = person({ name: "Rahul Menon", level: "super-admin", mustChangePassword: false });
    const api = await act(words.changeLevel.action, [kavita, rahul], "Rahul Menon");
    const dialog = within(
      screen.getByRole("dialog", { name: words.changeLevel.title.replace("{name}", "Rahul Menon") }),
    );
    await userEvent.click(dialog.getByRole("radio", { name: levels.support }));
    api.answer("platform.platformStaff.setLevel", { status: 409, reason: "LAST_SUPER_ADMIN" });
    await userEvent.click(dialog.getByRole("button", { name: words.changeLevel.submit }));
    expect(await dialog.findByText(messages.errors.reasons.LAST_SUPER_ADMIN)).toBeVisible();
  });

  it("gives someone a new temporary password, shown once", async () => {
    const api = await act(words.resetPassword.action);
    const dialog = within(
      screen.getByRole("dialog", { name: words.resetPassword.title.replace("{name}", "Arjun Nair") }),
    );
    api.answer("platform.platformStaff.resetPassword", { data: { temporaryPassword: "New4pass8Word" } });
    await userEvent.click(dialog.getByRole("button", { name: words.resetPassword.submit }));
    expect(await dialog.findByText("New4pass8Word")).toBeVisible();
    expect(inputsTo("platformStaff.resetPassword")).toEqual([{ userId: arjun.userId }]);
    await userEvent.click(dialog.getByRole("button", { name: words.handover.done }));
    expect(screen.queryByText("New4pass8Word")).toBeNull();
    await vi.waitFor(() => {
      expect(mutationsHeld()).toEqual([]);
    });
  });

  it("can't be closed while the new password is being made, and still shows it", async () => {
    const api = await act(words.resetPassword.action);
    const dialog = screen.getByRole("dialog", { name: words.resetPassword.title.replace("{name}", "Arjun Nair") });
    const held = heldAnswer({ data: { temporaryPassword: "New4pass8Word" } });
    api.answer("platform.platformStaff.resetPassword", held.answer);
    await userEvent.click(within(dialog).getByRole("button", { name: words.resetPassword.submit }));
    await userEvent.keyboard("{Escape}");
    expect(dialog).toBeVisible();
    held.release();
    expect(await within(dialog).findByText("New4pass8Word")).toBeVisible();
  });

  it("removes someone once confirmed", async () => {
    const api = await act(words.remove.action);
    const confirm = within(
      screen.getByRole("alertdialog", { name: words.remove.title.replace("{name}", "Arjun Nair") }),
    );
    api.answer("platform.platformStaff.remove", { data: null });
    api.answer("platform.platformStaff.list", {
      data: [kavita, { ...arjun, level: null, removedAt: "2026-10-16T06:00:00.000Z" }],
    });
    await userEvent.click(confirm.getByRole("button", { name: words.remove.confirm }));
    expect(await screen.findByText(words.remove.removed.replace("{name}", "Arjun Nair"))).toBeVisible();
    expect(inputsTo("platformStaff.remove")).toEqual([{ userId: arjun.userId }]);
    expect(await screen.findByRole("region", { name: words.removedTitle })).toBeVisible();
  });
});
