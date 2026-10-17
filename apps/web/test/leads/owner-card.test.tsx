// A lead's owner and source (spec 3.4, R43): the owner as a violet badge with Reassign for leads:assign, and where the
// lead came from with who added it.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { OwnerCard } from "@/leads/lead/owner-card";
import { stubApi } from "../support/api-stub";
import { aLead } from "./records";
import { owner, renderScreen, salesperson } from "./screen";

const { owner: words } = messages.leads.lead;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OwnerCard", () => {
  it("shows the owner as a violet badge, with Reassign for leads:assign, and the source with who added it", async () => {
    stubApi({ "leads.owners": { data: [{ userId: owner.user.id, name: "Asha Sharma" }] } });
    renderScreen(<OwnerCard lead={aLead({ source: "referral", sourceDetail: "Priya Nair" })} />);
    const card = screen.getByRole("region", { name: words.title });
    const badge = within(card).getByText("Asha Sharma");
    expect(badge).toHaveClass("bg-people-tint", "text-people-tint-ink");
    expect(within(card).getByText("Referral · added by Ravi Kumar")).toBeVisible();
    expect(within(card).getByText("Priya Nair")).toBeVisible();
    await userEvent.click(within(card).getByRole("button", { name: words.reassign }));
    expect(await screen.findByRole("dialog", { name: messages.leads.lead.reassign.title })).toBeVisible();
  });

  it("gives a salesperson no Reassign, and names a former member and an unassigned lead", () => {
    stubApi({});
    const { unmount } = renderScreen(<OwnerCard lead={aLead({ ownerUserId: null, people: {} })} />, {
      me: salesperson,
    });
    const card = screen.getByRole("region", { name: words.title });
    expect(within(card).getByText(words.unassigned)).toBeVisible();
    expect(within(card).getByText(`Phone call · added by ${words.formerMember}`)).toBeVisible();
    expect(within(card).queryByRole("button", { name: words.reassign })).not.toBeInTheDocument();
    unmount();
  });
});
