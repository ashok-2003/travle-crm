// A lead's stage bar (spec 3.4, R30, R31, P2): New → Contacted → Quote sent → Booking requested → Won, five 44px steps
// over their Progress, the current one marked as the step; tapping another moves the lead there, forwards or back. A
// Lost or Not a lead lead shows its badge and Reopen in place of the bar. A refusal shows its sentence until the next
// tap. Screen readers hear the current stage in the bar's name and where each step moves the lead; after a move or a
// Reopen, whose button is gone, the focus is on the new current stage. Without leads:edit the bar only shows.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { StageBar } from "@/leads/lead/stage-bar";
import { useLead } from "@/leads/lead/use-lead";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";
import { targetSize } from "../components/touch-targets";
import { aLead, ids } from "./records";
import { inputsTo, renderScreen } from "./screen";

const { lead: words, stages } = messages.leads;

const barNamed = (stage: keyof typeof stages) => ({ name: words.stageNamed.replace("{stage}", stages[stage]) });
const moveTo = (stage: keyof typeof stages) => ({ name: words.moveTo.replace("{stage}", stages[stage]) });

function renderBar(...[changes, me]: [Parameters<typeof aLead>[0], Parameters<typeof renderScreen>[1]?]) {
  const api = stubApi({ "leads.moveStage": { data: null }, "leads.reopen": { data: null } });
  renderScreen(<StageBar lead={aLead(changes)} />, me);
  return api;
}

/** The bar as the lead's page shows it: over leads.get, so a move shows the lead as the api then has it. */
function BarOnPage() {
  const lead = useLead(ids.rahul);
  return lead.data ? <StageBar lead={lead.data} /> : null;
}

function renderBarOnPage(stage: Parameters<typeof aLead>[0]) {
  const api = stubApi({
    "leads.get": { data: aLead(stage) },
    "leads.moveStage": { data: null },
    "leads.reopen": { data: null },
  });
  renderScreen(<BarOnPage />);
  return api;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Sonner keeps its toasts beyond a test, and the next test's Toaster would show them again.
  toast.dismiss();
});

describe("StageBar", () => {
  it("shows five 44px steps over the Progress; the current is aria-current='step'; tapping Quote sent moves the lead", async () => {
    renderBar({ stage: "contacted" });
    const bar = screen.getByRole("region", barNamed("contacted"));
    const steps = within(bar).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      stages.new,
      stages.contacted,
      stages.quote_sent,
      stages.booking_requested,
      stages.won,
    ]);
    const current = within(bar).getByText(stages.contacted);
    expect(current).toHaveAttribute("aria-current", "step");
    for (const step of steps) {
      const target = within(step).queryByRole("button") ?? within(step).getByText(/./);
      expect(targetSize(target).height).toBeGreaterThanOrEqual(44);
      expect(step.querySelector("[data-slot=progress]")).not.toBeNull();
    }
    expect(within(bar).queryByRole("button", moveTo("contacted"))).not.toBeInTheDocument();

    await userEvent.click(within(bar).getByRole("button", moveTo("quote_sent")));
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "quote_sent" }]);
    });
    expect(await screen.findByText(words.moved.replace("{stage}", stages.quote_sent))).toBeVisible();
  });

  it("puts the focus on the new current stage after a move, the tapped step being gone", async () => {
    const api = renderBarOnPage({ stage: "contacted" });
    const bar = await screen.findByRole("region", barNamed("contacted"));
    api.answer("leads.get", { data: aLead({ stage: "quote_sent" }) });
    await userEvent.click(within(bar).getByRole("button", moveTo("quote_sent")));
    const moved = await screen.findByRole("region", barNamed("quote_sent"));
    await waitFor(() => {
      expect(within(moved).getByText(stages.quote_sent)).toHaveFocus();
    });
  });

  it("puts the focus on the stage a Reopen returned the lead to", async () => {
    const api = renderBarOnPage({ stage: "lost", reopenStage: "quote_sent" });
    const bar = await screen.findByRole("region", barNamed("lost"));
    api.answer("leads.get", { data: aLead({ stage: "quote_sent" }) });
    await userEvent.click(within(bar).getByRole("button", { name: words.reopen }));
    const reopened = await screen.findByRole("region", barNamed("quote_sent"));
    await waitFor(() => {
      expect(within(reopened).getByText(stages.quote_sent)).toHaveFocus();
    });
  });

  it("writes its steps at the caption's size in the ghost button's own blue", () => {
    renderBar({ stage: "contacted" });
    const step = screen.getByRole("button", moveTo("quote_sent"));
    expect(step).toHaveClass("text-caption", "text-primary");
  });

  it("moves a lead back, and a Won lead to any stage", async () => {
    renderBar({ stage: "won" });
    expect(screen.getByText(stages.won)).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", moveTo("new")));
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "new" }]);
    });
  });

  it("shows a Lost or Not a lead lead's badge and Reopen in place of the bar", async () => {
    renderBar({ stage: "lost", reopenStage: "quote_sent" });
    const bar = screen.getByRole("region", barNamed("lost"));
    expect(within(bar).getByText(stages.lost)).toBeVisible();
    expect(within(bar).getByText(words.reopenReturns.replace("{stage}", stages.quote_sent))).toBeVisible();
    expect(within(bar).queryByRole("list")).not.toBeInTheDocument();
    await userEvent.click(within(bar).getByRole("button", { name: words.reopen }));
    await waitFor(() => {
      expect(inputsTo("leads.reopen")).toEqual([{ leadId: ids.rahul }]);
    });
    expect(await screen.findByText(words.reopened)).toBeVisible();
  });

  it("reopens a Not a lead lead to New when it had no stage before", () => {
    renderBar({ stage: "not_a_lead", reopenStage: null });
    expect(screen.getByText(stages.not_a_lead)).toBeVisible();
    expect(screen.getByText(words.reopenReturns.replace("{stage}", stages.new))).toBeVisible();
  });

  it("shows a refused move's sentence in the bar, and clears it on the next tap", async () => {
    const api = renderBar({ stage: "contacted" });
    api.answer("leads.moveStage", { status: 409, reason: "TASK_CLOSED" });
    const bar = screen.getByRole("region", barNamed("contacted"));
    await userEvent.click(within(bar).getByRole("button", moveTo("quote_sent")));
    expect(await within(bar).findByText(messages.errors.reasons.TASK_CLOSED)).toBeVisible();
    api.answer("leads.moveStage", "never");
    await userEvent.click(within(bar).getByRole("button", moveTo("won")));
    await waitFor(() => {
      expect(within(bar).queryByText(messages.errors.reasons.TASK_CLOSED)).not.toBeInTheDocument();
    });
  });

  it("shows a refused Reopen's sentence where the bar sits", async () => {
    const api = renderBar({ stage: "lost", reopenStage: "contacted" });
    api.answer("leads.reopen", { status: 403, reason: "ORGANIZATION_READ_ONLY" });
    const bar = screen.getByRole("region", barNamed("lost"));
    await userEvent.click(within(bar).getByRole("button", { name: words.reopen }));
    expect(await within(bar).findByText(messages.errors.reasons.ORGANIZATION_READ_ONLY)).toBeVisible();
  });

  it("only shows the stage to someone who can't edit leads", () => {
    const viewer = member({ permissions: ["leads:view"] });
    renderBar({ stage: "contacted" }, { me: viewer });
    expect(screen.getByText(stages.contacted)).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(words.chooseToMove)).not.toBeInTheDocument();
  });

  it("says how to move the lead in words for a mouse as for a finger, never 'Tap'", () => {
    renderBar({ stage: "contacted" });
    expect(screen.getByText(words.chooseToMove)).toBeVisible();
    expect(screen.queryByText(/\btap\b/i)).not.toBeInTheDocument();
  });
});
