// useFollowUpsDue asks the api for the member's due follow-ups only when they hold leads:view, which the api requires.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFollowUpsDue } from "@/follow-ups/use-follow-ups-due";
import { member } from "../support/members";
import { stubApi } from "../support/api-stub";
import { newQueryClient, renderWithApi } from "../organization/api";

function Probe() {
  const due = useFollowUpsDue();
  return <p>{due === undefined ? "nothing" : `${String(due.due)} due, ${String(due.replied)} replied`}</p>;
}

const row = (lastFrom: "customer" | "team") => ({
  taskId: "0199a000-0000-7000-8000-0000000000a1",
  title: "Call",
  dueAt: "2026-11-18T06:00:00.000Z",
  assigneeUserId: null,
  byAi: false,
  lead: { id: "0199a000-0000-7000-8000-0000000000b1", name: "Asha", stage: "contacted", phone: null },
  whatsapp: {
    conversationId: "0199a000-0000-7000-8000-0000000000c1",
    lastAt: null,
    lastFrom,
    lastText: null,
    windowOpen: true,
  },
  ai: null,
});

describe("useFollowUpsDue", () => {
  it("counts the due follow-ups and the ones the customer answered", async () => {
    stubApi({ "tasks.followUps": { data: { rows: [row("customer"), row("team")], people: {} } } });
    renderWithApi(<Probe />, newQueryClient(), member({ permissions: ["leads:view"] }));
    expect(await screen.findByText("2 due, 1 replied")).toBeInTheDocument();
  });

  it("makes no call for a member without leads:view", async () => {
    const stub = stubApi({ "tasks.followUps": { data: { rows: [], people: {} } } });
    renderWithApi(<Probe />, newQueryClient(), member({ permissions: ["inbox:view"] }));
    expect(await screen.findByText("nothing")).toBeInTheDocument();
    // Give a wrongly enabled query time to go out.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(stub.calls).not.toContain("tasks.followUps");
  });
});
