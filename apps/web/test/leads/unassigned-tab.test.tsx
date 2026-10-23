// The Unassigned tab (release 4, spec 3.3): its label carries how many leads wait, for whoever may assign leads; a
// salesperson, scoped to their own, never sees the tab or asks for the count.
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadsScreen } from "@/leads/list/leads-screen";
import { forgetTabValues } from "@/lib/tab-storage";
import { member } from "../support/members";
import type { SignedInMember } from "@/session/me-context";
import { stubApi } from "../support/api-stub";
import { address } from "./navigation";
import { aListItem, aPage, counts } from "./records";
import { inputsTo, owner, renderScreen, salesperson } from "./screen";

vi.mock("next/navigation", () => import("./navigation"));

beforeEach(() => {
  address.set("/leads");
  forgetTabValues();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderLeads(me: SignedInMember) {
  stubApi({
    "leads.list": aPage([aListItem()]),
    "leads.counts": { data: { ...counts, open: 3 } },
    "leads.owners": { data: [{ userId: owner.user.id, name: "Asha Sharma" }] },
    "destinations.search": { data: [] },
  });
  renderScreen(<LeadsScreen />, { me });
}

describe("the Unassigned tab", () => {
  it("shows how many leads wait", async () => {
    renderLeads(owner);
    expect(await screen.findByRole("tab", { name: "Unassigned (3)" })).toBeVisible();
    expect(inputsTo("leads.counts")).toContainEqual({ view: "unassigned" });
  });

  it("is not there for a salesperson, who never asks for the count", async () => {
    renderLeads(salesperson);
    await screen.findByRole("list");
    expect(screen.queryByRole("tab", { name: /Unassigned/ })).not.toBeInTheDocument();
    expect(inputsTo("leads.counts")).not.toContainEqual({ view: "unassigned" });
  });

  const scoped = (permissions: { permission: string; scope: "all" | "own" | null }[]) => {
    const base = member({ name: "Meena", userId: "0199a000-0000-7000-8000-0000000000a3" });
    return { ...base, member: { ...base.member, permissions } };
  };

  it("is there without a count for someone who sees all leads but can't assign them", async () => {
    renderLeads(scoped([{ permission: "leads:view", scope: "all" }]));
    expect(await screen.findByRole("tab", { name: "Unassigned" })).toBeVisible();
    expect(inputsTo("leads.counts")).not.toContainEqual({ view: "unassigned" });
  });

  it("is not there for someone scoped to their own leads, even if they can assign", async () => {
    renderLeads(
      scoped([
        { permission: "leads:view", scope: "own" },
        { permission: "leads:assign", scope: null },
      ]),
    );
    await screen.findByRole("list");
    expect(screen.queryByRole("tab", { name: /Unassigned/ })).not.toBeInTheDocument();
    expect(inputsTo("leads.counts")).not.toContainEqual({ view: "unassigned" });
  });
});
