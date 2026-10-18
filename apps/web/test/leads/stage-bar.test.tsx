// A lead's stage bar (spec 3.4, R30, R31, P2; DESIGN.md "Stage bar"): New → Contacted → Quote sent → Booking requested
// → Won as one progress bar with the stages' words under it, five 44px steps each covering its fifth of the bar and its
// word, the current one marked as the step. The bar fills from its start to the end of the current stage's fifth, in
// that stage's colour, and is decoration (the region's name and the step say the stage); passed words carry a check,
// later ones are muted; words in ink. Tapping another step moves the lead there, forwards or back. A Lost or Not a lead
// lead shows its badge and Reopen in place of the bar. A refusal shows its sentence until the next tap. Screen readers
// hear the current stage in the bar's name and where each step moves the lead; after a move or a Reopen, whose button
// is gone, the focus is on the new current stage. Without leads:edit the bar only shows.
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

/** The step that holds a stage's word: its button, or the current stage's mark. */
const stepOf = (stage: keyof typeof stages) => {
  const step = screen.getByText(stages[stage]).closest<HTMLElement>("button, [data-step]");
  if (step === null) throw new Error(`No step for ${stage}`);
  return step;
};
/** The bar's fill: where it reaches, as its shift left of full, and its colour. */
const fill = () => {
  const element = document.querySelector<HTMLElement>("[data-track] > [data-fill]");
  if (element === null) throw new Error("No fill");
  return element;
};

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
  it("shows one bar over five 44px steps, each one target over its fifth and its word; the current is the step; tapping Quote sent moves the lead", async () => {
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
    expect(stepOf("contacted")).toHaveAttribute("aria-current", "step");
    for (const step of steps) {
      // One target per step, so hover and focus sit on the whole stage; the bar runs across them, not inside them.
      const targets = step.querySelectorAll<HTMLElement>("button, [data-step]");
      expect(targets).toHaveLength(1);
      const [target] = targets;
      if (target === undefined) continue;
      expect(targetSize(target).height).toBeGreaterThanOrEqual(44);
      expect(target.querySelector("[data-track]")).toBeNull();
    }
    // One bar, decoration: the region's name and the current step already say the stage.
    const tracks = bar.querySelectorAll("[data-track]");
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toHaveAttribute("aria-hidden", "true");
    expect(within(bar).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(within(bar).queryByRole("button", moveTo("contacted"))).not.toBeInTheDocument();

    await userEvent.click(within(bar).getByRole("button", moveTo("quote_sent")));
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "quote_sent" }]);
    });
    expect(await screen.findByText(words.moved.replace("{stage}", stages.quote_sent))).toBeVisible();
  });

  it("fills the bar to the end of the current stage's fifth in its colour; passed words have a check, later ones are muted", () => {
    renderBar({ stage: "quote_sent" });
    expect(fill()).toHaveClass("bg-status-attention-dot");
    expect(fill()).toHaveStyle({ transform: "translateX(-40%)" });

    for (const stage of ["new", "contacted"] as const) {
      expect(stepOf(stage).querySelector("svg"), stage).not.toBeNull();
      expect(screen.getByText(stages[stage]), stage).not.toHaveClass("text-muted-foreground");
    }
    expect(screen.getByText(stages.quote_sent)).toHaveClass("font-semibold");
    expect(stepOf("quote_sent").querySelector("svg")).toBeNull();
    for (const stage of ["booking_requested", "won"] as const) {
      expect(screen.getByText(stages[stage]), stage).toHaveClass("text-muted-foreground");
      expect(stepOf(stage).querySelector("svg"), stage).toBeNull();
    }
  });

  it("fills a New lead's first fifth in its colour", () => {
    renderBar({ stage: "new" });
    expect(fill()).toHaveClass("bg-stage-new-dot");
    expect(fill()).toHaveStyle({ transform: "translateX(-80%)" });
  });

  it("fills a Won lead's whole bar in status green, done", () => {
    renderBar({ stage: "won" });
    expect(fill()).toHaveClass("bg-status-good-dot");
    expect(fill()).toHaveStyle({ transform: "translateX(0%)" });
    for (const stage of ["new", "contacted", "quote_sent", "booking_requested"] as const) {
      expect(stepOf(stage).querySelector("svg"), stage).not.toBeNull();
    }
  });

  it("slides the fill to a new stage only where motion is welcome", () => {
    renderBar({ stage: "contacted" });
    expect(fill()).toHaveClass("motion-safe:transition-transform");
    expect(fill()).not.toHaveClass("transition-transform");
  });

  it("writes its steps in ink at the caption's size (the label's on a wide screen), not the link blue, blue on hover", () => {
    renderBar({ stage: "contacted" });
    const step = screen.getByRole("button", moveTo("new"));
    expect(step).toHaveClass("text-caption", "lg:text-label", "text-foreground", "hover:bg-accent");
    expect(step).not.toHaveClass("text-primary");
  });

  it("puts the focus on the new current stage after a move, the tapped step being gone", async () => {
    const api = renderBarOnPage({ stage: "contacted" });
    const bar = await screen.findByRole("region", barNamed("contacted"));
    api.answer("leads.get", { data: aLead({ stage: "quote_sent" }) });
    await userEvent.click(within(bar).getByRole("button", moveTo("quote_sent")));
    await screen.findByRole("region", barNamed("quote_sent"));
    await waitFor(() => {
      expect(stepOf("quote_sent")).toHaveFocus();
    });
  });

  it("puts the focus on the stage a Reopen returned the lead to", async () => {
    const api = renderBarOnPage({ stage: "lost", reopenStage: "quote_sent" });
    const bar = await screen.findByRole("region", barNamed("lost"));
    api.answer("leads.get", { data: aLead({ stage: "quote_sent" }) });
    await userEvent.click(within(bar).getByRole("button", { name: words.reopen }));
    await screen.findByRole("region", barNamed("quote_sent"));
    await waitFor(() => {
      expect(stepOf("quote_sent")).toHaveFocus();
    });
  });

  it("moves a lead back, and a Won lead to any stage", async () => {
    renderBar({ stage: "won" });
    expect(stepOf("won")).toHaveAttribute("aria-current", "step");
    await userEvent.click(screen.getByRole("button", moveTo("new")));
    await waitFor(() => {
      expect(inputsTo("leads.moveStage")).toEqual([{ leadId: ids.rahul, stage: "new" }]);
    });
  });

  it("shows a Lost or Not a lead lead's badge and Reopen in place of the bar", async () => {
    renderBar({ stage: "lost", reopenStage: "quote_sent" });
    const bar = screen.getByRole("region", barNamed("lost"));
    expect(within(bar).getByText(stages.lost)).toBeVisible();
    expect(within(bar).getByText(stages.lost)).toHaveClass("bg-status-bad-fill");
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

  it("says what Not a lead means beside its badge, a term a first-time user may not know", async () => {
    renderBar({ stage: "not_a_lead", reopenStage: "contacted" });
    await userEvent.click(screen.getByRole("button", { name: "What does Not a lead mean?" }));
    expect(await screen.findByRole("dialog", { name: stages.not_a_lead })).toHaveAccessibleDescription(
      messages.leads.hints.notALead,
    );
  });

  it("gives Lost no such hint: its word says it", () => {
    renderBar({ stage: "lost", reopenStage: "contacted" });
    expect(screen.queryByRole("button", { name: /^What does/ })).not.toBeInTheDocument();
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

  it("only shows the stage to someone who can't edit leads, in the same colours", () => {
    const viewer = member({ permissions: ["leads:view"] });
    renderBar({ stage: "contacted" }, { me: viewer });
    expect(stepOf("contacted")).toHaveAttribute("aria-current", "step");
    expect(fill()).toHaveClass("bg-stage-contacted-dot");
    expect(fill()).toHaveStyle({ transform: "translateX(-60%)" });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(words.chooseToMove)).not.toBeInTheDocument();
  });

  it("says how to move the lead in words for a mouse as for a finger, never 'Tap'", () => {
    renderBar({ stage: "contacted" });
    expect(screen.getByText(words.chooseToMove)).toBeVisible();
    expect(screen.queryByText(/\btap\b/i)).not.toBeInTheDocument();
  });
});
