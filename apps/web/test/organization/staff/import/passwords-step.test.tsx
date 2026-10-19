// The staff import's end (spec 3.4, B46-B50): the temporary passwords shown once, from this tab's memory, with the
// sheet to download; and, once they are gone, new ones for the people who haven't signed in yet, one at a time.
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordsStep } from "@/organization/staff/import/passwords-step";
import { passwordStore } from "@/organization/staff/import/password-store";
import { StaffImportScreen } from "@/organization/staff/import/staff-import-screen";
import { fakeApi, newQueryClient, renderWithApi } from "../../api";
import { screenIs } from "../../render";
import { aPage, importId } from "./support";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const added = [
  {
    rowNumber: 2,
    memberId: "0199a000-0000-7000-8000-0000000000b1",
    name: "Kavita Rao",
    username: "kavita",
    email: null,
    mustChangePassword: true,
  },
  {
    rowNumber: 3,
    memberId: "0199a000-0000-7000-8000-0000000000b2",
    name: "Deepak Nair",
    username: null,
    email: "deepak@sharma.in",
    mustChangePassword: true,
  },
  {
    rowNumber: 4,
    memberId: "0199a000-0000-7000-8000-0000000000b3",
    name: "Farah Khan",
    username: "farah",
    email: null,
    mustChangePassword: false,
  },
];
const done = () =>
  aPage({
    status: "done",
    added,
    progress: { rowsTotal: 3, rowsToAdd: 3, rowsDone: 3, rowsAdded: 3, addRequestedAt: "2026-10-19T11:02:00.000Z" },
    finishedAt: "2026-10-19T11:02:30.000Z",
  });

describe("PasswordsStep", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    passwordStore.forget(importId);
  });

  it("shows each password once with CopyButton, downloads the sheet, and reads Downloaded after", async () => {
    passwordStore.keep(
      importId,
      new Map([
        [2, "h7Kq3mPx9Tzc"],
        [3, "pV6kD3sHu9Mx"],
        [4, "Rw4bN8tYe2Qa"],
      ]),
    );
    const saved: Blob[] = [];
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: (blob: Blob) => (saved.push(blob), "blob:x"), revokeObjectURL: vi.fn() }),
    );
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    renderWithApi(<PasswordsStep importId={importId} page={done()} />, newQueryClient());
    expect(screen.getByRole("heading", { name: /3 people added/ })).toBeVisible();
    expect(screen.getByText("Download these passwords now")).toBeVisible();
    expect(screen.getByText("They can't be shown again: we never keep them.")).toBeVisible();
    const kavita = screen.getByRole("row", { name: /Kavita Rao/ });
    expect(within(kavita).getByText("h7Kq3mPx9Tzc")).toHaveClass("numbers");
    expect(within(screen.getByRole("row", { name: /Deepak Nair/ })).getByText("None")).toBeVisible();
    expect(
      screen.getByText(
        "Each person chooses their own password when they first sign in, with the organization code SHARMA.",
      ),
    ).toBeVisible();
    await userEvent.click(within(kavita).getByRole("button", { name: "Copy Kavita Rao's password" }));
    expect(copy).toHaveBeenCalledWith("h7Kq3mPx9Tzc");

    await userEvent.click(screen.getByRole("button", { name: "Download the passwords (.csv)" }));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Downloaded" })).toBeDisabled();
    expect(saved).toHaveLength(1);
    const blob = saved[0];
    if (blob === undefined) throw new Error("no sheet was saved");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : "");
      };
      reader.readAsText(blob);
    });
    expect(text).toContain('"Kavita Rao","kavita","","h7Kq3mPx9Tzc","SHARMA"');
    click.mockRestore();
  });

  it("forgets the passwords on leaving; coming back offers new passwords for the 2 who haven't signed in", async () => {
    passwordStore.keep(importId, new Map([[2, "h7Kq3mPx9Tzc"]]));
    const api = fakeApi();
    const queryClient = newQueryClient();
    const trpcKey = [["staffImports", "get"], { input: { importId }, type: "query" }];
    queryClient.setQueryDefaults(trpcKey, { staleTime: Infinity });
    queryClient.setQueryData(trpcKey, done());
    const shown = renderWithApi(<StaffImportScreen importId={importId} />, queryClient);
    expect(await screen.findByText("h7Kq3mPx9Tzc")).toBeVisible();
    shown.unmount();
    expect(passwordStore.get(importId)).toBeUndefined();

    renderWithApi(<StaffImportScreen importId={importId} />, queryClient);
    expect(await screen.findByText(/These passwords were shown once/)).toBeVisible();
    expect(screen.queryByText("h7Kq3mPx9Tzc")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Make new passwords for the 2 people who haven't signed in yet" }),
    );
    // One person at a time, each with a password made here.
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    expect(api.last().path).toBe("staff.resetPassword");
    expect(api.last().input).toMatchObject({ memberId: added[0]?.memberId });
    const first = (api.last().input as { temporaryPassword: string }).temporaryPassword;
    await act(async () => {
      api.last().answer({});
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    expect(api.last().input).toMatchObject({ memberId: added[1]?.memberId });
    await act(async () => {
      api.last().answer({});
      await Promise.resolve();
    });
    // Farah Khan chose her own password and is left alone; the two others have new ones on the screen.
    expect(await screen.findByText(first)).toBeVisible();
    expect(screen.queryByRole("row", { name: /Farah Khan/ })).toBeNull();
    expect(screen.getByText("Download these passwords now")).toBeVisible();
  });
});
