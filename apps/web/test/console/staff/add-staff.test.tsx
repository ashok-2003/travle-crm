// Adding platform staff (ADR 0019): a name, an address and a level; the temporary password the api makes is shown
// once, with copy, and what the newcomer must do at first sign-in (replace it, set up two-factor). It is gone once the
// dialog closes. The api's own schema checks the form first; a refusal shows its sentence.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaffScreen } from "@/console/staff/staff-screen";
import { messages } from "@/i18n/messages";
import { heldAnswer, stubApi } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { inputsTo, renderConsole } from "../../support/render-console";
import { CacheProbe, mutationsHeld } from "./cache-probe";
import { kavita, viewer } from "./people";

// Two-factor is off in the product (@travel-crm/contracts/features): these tests prove what turning it on brings.
vi.mock("@travel-crm/contracts/features", () => ({ features: { twoFactor: true } }));

const { staff: words } = messages.consolePlatform;

async function openForm() {
  const api = stubApi({ "platform.platformStaff.list": { data: [kavita] } });
  renderConsole(
    <>
      <StaffScreen />
      <CacheProbe />
    </>,
    viewer,
  );
  await userEvent.click(await screen.findByRole("button", { name: words.add }));
  return { api, dialog: within(screen.getByRole("dialog", { name: words.addForm.title })) };
}

/** Pasted, one event a field: typing key by key is slow on a busy machine. */
async function fill(field: HTMLElement, value: string) {
  await userEvent.click(field);
  await userEvent.paste(value);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adding platform staff", () => {
  it("shows the temporary password once, with what the newcomer must do, and forgets it after", async () => {
    screenIs("wide");
    const { api, dialog } = await openForm();
    await fill(dialog.getByLabelText(words.addForm.name), "Neha Joshi");
    await fill(dialog.getByLabelText(words.addForm.email), "Neha@Platform.test");
    await userEvent.click(dialog.getByRole("radio", { name: messages.console.levels["super-admin"] }));
    api.answer("platform.platformStaff.add", {
      data: { userId: "0199a000-0000-7000-8000-0000000000b0", temporaryPassword: "Tmp7kQx2pLm9" },
    });
    await userEvent.click(dialog.getByRole("button", { name: words.addForm.submit }));

    const handover = within(
      await screen.findByRole("dialog", { name: words.handover.added.replace("{name}", "Neha Joshi") }),
    );
    expect(inputsTo("platformStaff.add")).toEqual([
      { name: "Neha Joshi", email: "neha@platform.test", level: "super-admin" },
    ]);
    expect(handover.getByText("neha@platform.test")).toBeVisible();
    expect(handover.getByText("Tmp7kQx2pLm9")).toBeVisible();
    expect(handover.getByRole("button", { name: words.handover.copyPassword })).toBeVisible();
    expect(handover.getByText(words.handover.firstSignInWithTwoFactor)).toBeVisible();

    await userEvent.click(handover.getByRole("button", { name: words.handover.done }));
    expect(screen.queryByText("Tmp7kQx2pLm9")).toBeNull();
    await vi.waitFor(() => {
      expect(mutationsHeld()).toEqual([]);
    });
    await userEvent.click(screen.getByRole("button", { name: words.add }));
    expect(
      within(screen.getByRole("dialog", { name: words.addForm.title })).getByLabelText(words.addForm.name),
    ).toHaveValue("");
  });

  it("can't be closed while the person is being added, and still shows the password", async () => {
    screenIs("wide");
    const { api, dialog } = await openForm();
    await fill(dialog.getByLabelText(words.addForm.name), "Neha Joshi");
    await fill(dialog.getByLabelText(words.addForm.email), "neha@platform.test");
    const held = heldAnswer({
      data: { userId: "0199a000-0000-7000-8000-0000000000b0", temporaryPassword: "Tmp7kQx2pLm9" },
    });
    api.answer("platform.platformStaff.add", held.answer);
    await userEvent.click(dialog.getByRole("button", { name: words.addForm.submit }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: words.addForm.title })).toBeVisible();
    held.release();
    expect(await screen.findByText("Tmp7kQx2pLm9")).toBeVisible();
  });

  it("shows the password, and lets Done close, though the list's refresh hasn't come back", async () => {
    screenIs("wide");
    const { api, dialog } = await openForm();
    await fill(dialog.getByLabelText(words.addForm.name), "Neha Joshi");
    await fill(dialog.getByLabelText(words.addForm.email), "neha@platform.test");
    api.answer("platform.platformStaff.add", {
      data: { userId: "0199a000-0000-7000-8000-0000000000b0", temporaryPassword: "Tmp7kQx2pLm9" },
    });
    api.answer("platform.platformStaff.list", "never");
    await userEvent.click(dialog.getByRole("button", { name: words.addForm.submit }));
    expect(await screen.findByText("Tmp7kQx2pLm9")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.handover.done }));
    expect(screen.queryByText("Tmp7kQx2pLm9")).toBeNull();
  });

  it("says what to fix before anything is sent", async () => {
    screenIs("wide");
    const { dialog } = await openForm();
    await fill(dialog.getByLabelText(words.addForm.email), "not-an-address");
    await userEvent.click(dialog.getByRole("button", { name: words.addForm.submit }));
    expect(await dialog.findByText(words.addForm.problems.required)).toBeVisible();
    expect(dialog.getByText(words.addForm.problems.emailInvalid)).toBeVisible();
    expect(inputsTo("platformStaff.add")).toEqual([]);
  });

  it("shows the api's sentence when it refuses", async () => {
    screenIs("phone");
    const { api, dialog } = await openForm();
    await fill(dialog.getByLabelText(words.addForm.name), "Neha Joshi");
    await fill(dialog.getByLabelText(words.addForm.email), "neha@platform.test");
    api.answer("platform.platformStaff.add", { status: 409, reason: "STAFF_EMAIL_TAKEN" });
    await userEvent.click(dialog.getByRole("button", { name: words.addForm.submit }));
    expect(await dialog.findByText(messages.errors.reasons.STAFF_EMAIL_TAKEN)).toBeVisible();
    expect(inputsTo("platformStaff.add")).toEqual([
      { name: "Neha Joshi", email: "neha@platform.test", level: "support" },
    ]);
  });
});
