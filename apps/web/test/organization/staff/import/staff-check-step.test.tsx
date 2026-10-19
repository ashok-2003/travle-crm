// The staff import's third step (spec 3.4, B44-B47): the rows left out with their reasons and "Already on your staff"
// apart, the seats, and Add: asked once, the passwords made here and sent 25 at a time, held while it goes, and gone
// when it fails or the import returns to its preview. They are in no cache or storage.
import { dehydrate } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffCheckStep } from "@/organization/staff/import/staff-check-step";
import { passwordStore } from "@/organization/staff/import/password-store";
import { fakeApi, newQueryClient, renderWithApi, type PendingCall } from "../../api";
import { screenIs } from "../../render";
import { aPage, aRow, importId, seedRows } from "./support";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const people = (count: number) => Array.from({ length: count }, (_, index) => aRow(index + 2));

function setup(count: number, overrides: Parameters<typeof aPage>[0] = {}) {
  const api = fakeApi();
  const queryClient = newQueryClient();
  seedRows(queryClient, {
    new: people(count),
    notAdded: [
      aRow(count + 2, { name: "Ravi Kumar", value: "ravi", reasons: [{ code: "already_on_staff" }] }),
      aRow(count + 3, { name: "Pooja Desai", value: null, reasons: [{ code: "no_sign_in_name" }] }),
      aRow(count + 4, { name: "Meera Iyer", value: "meera", reasons: [{ code: "same_username_as_row", row: 4 }] }),
    ],
  });
  const page = aPage({
    progress: { rowsTotal: count + 3, rowsToAdd: count, rowsDone: 0, rowsAdded: 0, addRequestedAt: null },
    ...overrides,
  });
  const onChangeColumns = vi.fn();
  renderWithApi(<StaffCheckStep page={page} onChangeColumns={onChangeColumns} />, queryClient);
  return { api, queryClient, onChangeColumns };
}

/** Answers the call the app has made, then lets what follows it start. */
async function answer(call: PendingCall, data?: unknown) {
  await act(async () => {
    call.answer(data);
    await Promise.resolve();
  });
}

describe("StaffCheckStep", () => {
  beforeEach(() => {
    screenIs("wide");
    push.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    passwordStore.forget(importId);
  });

  it("lists every row not added, Already on your staff apart, and shows 'Adds 12 people: your plan has 14 seats free.'", () => {
    setup(12);
    expect(screen.getByRole("heading", { name: /^Will be added · 12$/ })).toBeVisible();
    expect(screen.getByText("and 8 more")).toBeVisible();
    const left = screen.getByRole("region", { name: /^Left out/ });
    expect(within(left).getByText("Pooja Desai")).toBeVisible();
    expect(within(left).getByText("Row 15 · No username or email")).toBeVisible();
    expect(within(left).getByText("Row 16 · Same username as row 4 · meera")).toBeVisible();
    expect(within(left).queryByText("Ravi Kumar")).toBeNull();
    const already = screen.getByRole("region", { name: /^Already on your staff/ });
    expect(within(already).getByText("Row 14 · Already on your staff · ravi")).toBeVisible();
    expect(screen.getByText("Adds 12 people: your plan has 14 seats free.")).toBeVisible();
  });

  it("turns Add off over the seats with the sentence and the support contact", () => {
    setup(16, { seats: { free: 14 } });
    expect(screen.getByRole("button", { name: "Add 16 people" })).toBeDisabled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "This file adds 16 people, and your plan has 14 seats free. Leave some rows out, or ask us about more seats.",
    );
    expect(within(alert).getByRole("link", { name: "ask us about more seats" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^mailto:/),
    );
  });

  it("goes back to the columns, and says when a try was sent back to the preview", async () => {
    const { onChangeColumns } = setup(3, { failureReason: "row_changed" });
    expect(
      screen.getByText("Nobody was added: a row changed since the check. Check the list and press Add again."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Change the columns" }));
    expect(onChangeColumns).toHaveBeenCalled();
  });

  it("asks 'Add 12 people?' once, makes the passwords in the browser and sends them 25 at a time", async () => {
    const { api } = setup(30, { seats: { free: null } });
    await userEvent.click(screen.getByRole("button", { name: "Add 30 people" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Add 30 people?");
    expect(dialog).toHaveTextContent("Each gets a temporary password, shown once on the next screen.");
    expect(api.calls).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 30 people" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    const first = api.last();
    expect(first.path).toBe("staffImports.setPasswords");
    const sent = (first.input as { passwords: { rowNumber: number; password: string }[] }).passwords;
    expect(sent.map((entry) => entry.rowNumber)).toEqual(Array.from({ length: 25 }, (_, index) => index + 2));
    // Twelve characters with no 0/O, 1/l/I, to be read out over a phone.
    for (const { password } of sent) expect(password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{12}$/);
    await answer(first);
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    expect((api.last().input as { passwords: unknown[] }).passwords).toHaveLength(5);
    await answer(api.last());
    await waitFor(() => {
      expect(api.calls).toHaveLength(3);
    });
    expect(api.last().path).toBe("staffImports.add");
    expect(api.last().input).toEqual({ importId });
    expect(passwordStore.get(importId)?.size).toBe(30);
  });

  it("keeps Add busy while the passwords are sent and the job is asked, and drops them if Add is refused", async () => {
    const { api } = setup(3);
    await userEvent.click(screen.getByRole("button", { name: "Add 3 people" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add 3 people" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Add 3 people" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(passwordStore.get(importId)?.size).toBe(3);
    await answer(api.last());
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    await act(async () => {
      api.last().refuse(409, "IMPORT_ALREADY_RUNNING");
      await Promise.resolve();
    });
    expect(await within(dialog).findByText("Another import is being added. Try again when it's done.")).toBeVisible();
    expect(passwordStore.get(importId)).toBeUndefined();
  });

  it("keeps the passwords when the answer to Add is lost, since Add may have landed", async () => {
    const { api } = setup(2);
    await userEvent.click(screen.getByRole("button", { name: "Add 2 people" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Add 2 people" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    await answer(api.last());
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    await act(async () => {
      api.last().fail();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    });
    expect(passwordStore.get(importId)?.size).toBe(2);
  });

  it("keeps passwords out of the query cache, the mutation cache and web storage", async () => {
    const { api, queryClient } = setup(2);
    await userEvent.click(screen.getByRole("button", { name: "Add 2 people" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Add 2 people" }));
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    const passwords = [...(passwordStore.get(importId)?.values() ?? [])];
    expect(passwords).toHaveLength(2);
    const everything = JSON.stringify([
      dehydrate(queryClient, { shouldDehydrateMutation: () => true, shouldDehydrateQuery: () => true }),
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => mutation.state),
      Object.keys(localStorage).map((key) => localStorage.getItem(key)),
      Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key)),
    ]);
    for (const password of passwords) expect(everything).not.toContain(password);
  });
});
