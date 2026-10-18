// What's next about a lead (R43): an overdue task in red, then a new lead still waiting in amber, then the next task
// in violet when it is due today and quiet grey when later or none, each in words, by the agency's clocks. The two
// statuses, overdue and waiting, carry their dot beside the words (DESIGN.md: Dot Plus Word).
import type { LeadNextStep } from "@travel-crm/contracts/crm";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextStep } from "@/leads/next-step";
import { renderPiece } from "./render";

// 11:00 am on Friday 16 October 2026 in India.
const NOW = new Date("2026-10-16T05:30:00Z");

const task = (kind: "follow-up" | "task", dueAt: string) => ({
  id: "0199e7a0-0000-7000-8000-0000000000f1",
  kind,
  title: "Send the Goa options",
  dueAt,
});

function shows(next: LeadNextStep): HTMLElement {
  const { container } = renderPiece(<NextStep next={next} timeZone="Asia/Kolkata" />);
  const line = container.firstElementChild;
  if (!(line instanceof HTMLElement)) throw new Error("NextStep rendered nothing");
  return line;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The status dot before the words, if the line has one: decoration, hidden from screen readers. */
const dotOf = (line: HTMLElement) => line.querySelector("[aria-hidden=true].rounded-full");

describe("NextStep", () => {
  it("reads 'Follow-up overdue · yesterday, 5:00 pm' in the bad ink, '12 min ago · not contacted yet' in the attention ink, 'Follow up today, 4:00 pm' in the people ink", () => {
    const overdue = shows({
      awaitingReplySince: "2026-10-16T05:18:00Z",
      task: task("follow-up", "2026-10-15T11:30:00Z"),
    });
    expect(overdue).toHaveTextContent("Follow-up overdue · yesterday, 5:00 pm");
    expect(overdue).toHaveClass("text-status-bad-ink");

    const waiting = shows({
      awaitingReplySince: "2026-10-16T05:18:00Z",
      task: task("follow-up", "2026-10-16T10:30:00Z"),
    });
    expect(waiting).toHaveTextContent("12 min ago · not contacted yet");
    expect(waiting).toHaveClass("text-status-attention-ink");

    const today = shows({ awaitingReplySince: null, task: task("follow-up", "2026-10-16T10:30:00Z") });
    expect(today).toHaveTextContent("Follow up today, 4:00 pm");
    expect(today).toHaveClass("text-people-tint-ink");
  });

  it("puts a status dot before the overdue and waiting words, and none before the others", () => {
    const overdue = shows({ awaitingReplySince: null, task: task("follow-up", "2026-10-15T11:30:00Z") });
    expect(dotOf(overdue)).toHaveClass("bg-status-bad-dot");
    const waiting = shows({ awaitingReplySince: "2026-10-16T05:18:00Z", task: null });
    expect(dotOf(waiting)).toHaveClass("bg-status-attention-dot");
    expect(dotOf(shows({ awaitingReplySince: null, task: task("follow-up", "2026-10-16T10:30:00Z") }))).toBeNull();
    expect(dotOf(shows({ awaitingReplySince: null, task: null }))).toBeNull();
  });

  it("is quiet for later and for nothing, and names a task as a task", () => {
    const tomorrow = shows({ awaitingReplySince: null, task: task("follow-up", "2026-10-17T05:30:00Z") });
    expect(tomorrow).toHaveTextContent("Follow up tomorrow, 11:00 am");
    expect(tomorrow).toHaveClass("text-muted-foreground");
    expect(shows({ awaitingReplySince: null, task: task("follow-up", "2026-10-19T05:30:00Z") })).toHaveTextContent(
      "Follow up 19 Oct",
    );
    const none = shows({ awaitingReplySince: null, task: null });
    expect(none).toHaveTextContent("No follow-up yet");
    expect(none).toHaveClass("text-muted-foreground");
    expect(shows({ awaitingReplySince: null, task: task("task", "2026-10-14T05:30:00Z") })).toHaveTextContent(
      "Task overdue · 14 Oct, 11:00 am",
    );
    expect(screen.getByText("Task overdue · 14 Oct, 11:00 am")).toHaveClass("text-status-bad-ink");
    expect(shows({ awaitingReplySince: "2026-10-15T20:00:00Z", task: null })).toHaveTextContent(
      "9 hr ago · not contacted yet",
    );
  });
});
