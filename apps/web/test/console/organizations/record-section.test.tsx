// The organization's row and business profile on its console page: the row's values (the code, which never changes,
// and the onboarding day in mono), corrected through organizations.update with a refusal's sentence kept in the
// dialog; and the profile read-only, the account number as the api masks it, a missing value said.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileSection, RecordSection } from "@/console/organizations/organization/record-and-profile";
import { messages } from "@/i18n/messages";
import { stubApi } from "../../support/api-stub";
import { screenIs } from "../../organization/render";
import { organizationDetails, organizationId } from "./organization-details";
import { inputsTo as inputsSentTo, renderConsole as renderConsoleScreen } from "../../support/render-console";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast, Toaster: () => null }));

const { record, profile } = messages.consoleOrganizations;
const details = organizationDetails();

afterEach(() => {
  vi.unstubAllGlobals();
  toast.success.mockReset();
});

function valueOf(label: string): HTMLElement {
  const term = screen.getByText(label, { selector: "[data-slot=item-description]" });
  const value = term.nextElementSibling;
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`);
  return value;
}

describe("RecordSection", () => {
  it("shows the organization's row, its zone in words and its onboarding day", () => {
    screenIs("wide");
    stubApi({});
    renderConsoleScreen(<RecordSection organization={details.organization} />);
    expect(valueOf(record.name)).toHaveTextContent("Kerala Trails");
    expect(within(valueOf(record.code)).getByText("KERALA")).toHaveClass("numbers");
    expect(valueOf(record.timeZone)).toHaveTextContent("India (Asia/Kolkata)");
    expect(valueOf(record.contactEmail)).toHaveTextContent("hello@keralatrails.example");
    expect(valueOf(record.onboardedOn)).toHaveTextContent("1 Oct");
  });

  it("corrects the name and clears the contact email, then says it is saved", async () => {
    screenIs("wide");
    stubApi({ "platform.organizations.update": { data: details.organization } });
    renderConsoleScreen(<RecordSection organization={details.organization} />);
    await userEvent.click(screen.getByRole("button", { name: record.correct }));
    const dialog = await screen.findByRole("dialog", { name: record.dialogTitle });
    await userEvent.clear(within(dialog).getByLabelText(record.name));
    await userEvent.type(within(dialog).getByLabelText(record.name), "Kerala Trails and Treks");
    await userEvent.clear(within(dialog).getByLabelText(record.contactEmail));
    await userEvent.click(within(dialog).getByRole("button", { name: record.save }));
    await vi.waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(record.saved);
    });
    expect(inputsSentTo("organizations.update")).toEqual([
      { organizationId, name: "Kerala Trails and Treks", timeZone: "Asia/Kolkata", contactEmail: null },
    ]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names a blank name before sending, and keeps a refusal's sentence in the dialog", async () => {
    screenIs("wide");
    const api = stubApi({ "platform.organizations.update": { status: 404, reason: "ORGANIZATION_NOT_FOUND" } });
    renderConsoleScreen(<RecordSection organization={details.organization} />);
    await userEvent.click(screen.getByRole("button", { name: record.correct }));
    const dialog = await screen.findByRole("dialog", { name: record.dialogTitle });
    await userEvent.clear(within(dialog).getByLabelText(record.name));
    await userEvent.click(within(dialog).getByRole("button", { name: record.save }));
    expect(await within(dialog).findByText(record.problems.required)).toBeVisible();
    expect(api.calls).not.toContain("platform.organizations.update");
    await userEvent.type(within(dialog).getByLabelText(record.name), "Kerala Trails");
    await userEvent.click(within(dialog).getByRole("button", { name: record.save }));
    expect(await within(dialog).findByText(messages.errors.reasons.ORGANIZATION_NOT_FOUND)).toBeVisible();
  });
});

describe("ProfileSection", () => {
  it("shows the business profile read-only, the account number masked and a missing value said", () => {
    stubApi({});
    renderConsoleScreen(<ProfileSection profile={details.profile} />);
    expect(within(valueOf(profile.gstin)).getByText("32AAPFU0939F1Z4")).toHaveClass("numbers");
    expect(valueOf(profile.gstState)).toHaveTextContent("32Kerala");
    expect(valueOf(profile.contactPhone)).toHaveTextContent("+91 98765 43210");
    expect(valueOf(profile.bankAccountNumber)).toHaveTextContent("XXXX7890");
    expect(valueOf(profile.address)).toHaveTextContent(profile.notGiven);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says when there is no profile yet", () => {
    stubApi({});
    renderConsoleScreen(<ProfileSection profile={null} />);
    expect(screen.getByText(profile.none)).toBeVisible();
  });
});
