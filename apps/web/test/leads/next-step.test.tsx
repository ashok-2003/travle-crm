// What's next about a lead (R43): an overdue task in red, then a new lead still waiting in amber, then the next task
// in violet when it is due today and quiet grey when later or none, each in words, by the agency's clocks.
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

describe("NextStep", () => {
  it("reads 'Follow-up overdue · yesterday, 5:00 pm' in the bad ink, '12 min ago · no reply yet' in the attention ink, 'Follow up today, 4:00 pm' in the people ink", () => {
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
    expect(waiting).toHaveTextContent("12 min ago · no reply yet");
    expect(waiting).toHaveClass("text-status-attention-ink");

    const today = shows({ awaitingReplySince: null, task: task("follow-up", "2026-10-16T10:30:00Z") });
    expect(today).toHaveTextContent("Follow up today, 4:00 pm");
    expect(today).toHaveClass("text-people-tint-ink");
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
      "9 hr ago · no reply yet",
    );
  });
});
