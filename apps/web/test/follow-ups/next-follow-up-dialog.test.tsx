// The next-follow-up dialog: four choices, the first three add a follow-up on the same lead with the same words at the
// same time of day, and while the request is out it holds (rule 7).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextFollowUpDialog } from "@/follow-ups/next-follow-up-dialog";
import { renderAs, screenIs } from "../organization/render";
import { stubCalls, type Call } from "../today/api";
import { now } from "../today/records";

const target = {
  leadId: "0199e7a0-0000-7000-8000-000000000301",
  title: "Send Goa options",
  dueAt: "2026-10-15T11:30:00.000Z",
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("phone");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NextFollowUpDialog", () => {
  it.each([
    ["Tomorrow", "2026-10-17"],
    ["In 3 days", "2026-10-19"],
    ["Next week", "2026-10-23"],
  ])("%s adds the follow-up on %s at 5:00 pm, the time of the one just done", async (label, on) => {
    const { calls } = stubCalls(() => ({ data: null }));
    const onClose = vi.fn();
    renderAs(<NextFollowUpDialog target={target} onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: label }));
    await waitFor(() => {
      expect(calls.find((call: Call) => call.path === "leads.addWork")?.input).toEqual({
        leadId: target.leadId,
        kind: "follow-up",
        title: target.title,
        due: { on, at: "17:00" },
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("holds while the request is out: the choices are off and Escape does nothing", async () => {
    stubCalls(() => "never");
    const onClose = vi.fn();
    renderAs(<NextFollowUpDialog target={target} onClose={onClose} />);
    await userEvent.click(await screen.findByRole("button", { name: "Tomorrow" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "In 3 days" })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: "No more follow-ups" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows nothing without a target", () => {
    stubCalls(() => "never");
    renderAs(<NextFollowUpDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
