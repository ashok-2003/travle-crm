// One thing on Today (spec 3.5, the mockup): the person's name leading to their lead, when it is due in the colour of
// its urgency (red overdue, amber a new lead waiting, violet due today), what to do and the trip, then two rows of
// 44px buttons: how to reach them (Call and WhatsApp, outline), then how to close it (Done and Snooze, outline), or Mark
// contacted for a new lead. A task on no lead has no one to call.
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/messages";
import { leadRoute } from "@/lib/routes";
import { TodayItem } from "@/today/today-item";
import { targetSize } from "../components/touch-targets";
import { renderAs, screenIs } from "../organization/render";
import { member } from "../support/members";
import { stubCalls } from "./api";
import { aLead, now, priyaDue, rahulNew, snehaOverdue, standaloneDue, vikramOverdue } from "./records";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  screenIs("phone");
  stubCalls(() => "never");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const listItem = () => screen.getByRole("listitem");

describe("TodayItem", () => {
  it("puts the compact Call and WhatsApp, then Done and Snooze (outline), on one row, all 44px", () => {
    renderAs(<TodayItem item={snehaOverdue} />);
    const call = screen.getByRole("link", { name: "Call Sneha Iyer" });
    const whatsApp = screen.getByRole("link", { name: "WhatsApp Sneha Iyer" });
    const done = screen.getByRole("button", { name: "Done: Send Goa options" });
    const snooze = screen.getByRole("button", { name: "Snooze: Send Goa options" });
    expect(call.parentElement).toBe(whatsApp.parentElement);
    expect(done.parentElement).toBe(snooze.parentElement);
    expect(call.parentElement?.parentElement).toBe(done.parentElement?.parentElement?.parentElement);
    // Reaching them comes first, then closing it.
    expect(call.compareDocumentPosition(done) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Round and icon-only: named for a screen reader, no words beside the glyph.
    expect([call, whatsApp].map((button) => button.textContent)).toEqual(["", ""]);
    expect([call, whatsApp].map((button) => button.dataset.size)).toEqual(["icon", "icon"]);
    expect([done, snooze].map((button) => button.dataset.variant)).toEqual(["outline", "outline"]);
    for (const target of [call, whatsApp, done, snooze]) {
      expect(targetSize(target).height, target.textContent).toBeGreaterThanOrEqual(44);
    }
  });

  it("names the person as a link to their lead, then what to do and the trip", () => {
    renderAs(<TodayItem item={snehaOverdue} />);
    const name = within(listItem()).getByRole("link", { name: "Sneha Iyer" });
    expect(name).toHaveAttribute("href", leadRoute(aLead().id));
    expect(targetSize(name).height).toBeGreaterThanOrEqual(44);
    expect(within(listItem()).getByText("Send Goa options")).toBeVisible();
    const trip = within(listItem()).getByText("Goa · Jan 2027 · 6 adults");
    expect(trip).toHaveClass("line-clamp-1");
    expect(trip).toHaveAttribute("title", "Goa · Jan 2027 · 6 adults");
  });

  it("says when in the colour of its urgency: overdue red, a new lead's wait amber, due today violet", () => {
    const { unmount } = renderAs(<TodayItem item={snehaOverdue} />);
    expect(screen.getByText("Yesterday, 5:00 pm")).toHaveClass("text-status-bad-ink");
    unmount();
    const vikram = renderAs(<TodayItem item={vikramOverdue} />);
    expect(screen.getByText("Today, 9:30 am")).toHaveClass("text-status-bad-ink");
    // No trip known yet: what to do alone.
    expect(screen.getByText("Send the revised Rajasthan quote")).toBeVisible();
    vikram.unmount();
    const rahul = renderAs(<TodayItem item={rahulNew} />);
    expect(screen.getByText("12 min")).toHaveClass("text-status-attention-ink");
    expect(screen.getByText(`Kashmir · Dec · ${messages.leads.sources.phone_call}`)).toBeVisible();
    rahul.unmount();
    renderAs(<TodayItem item={priyaDue} />);
    expect(screen.getByText("4:00 pm")).toHaveClass("text-people-tint-ink");
  });

  it("gives a new lead Mark contacted in place of Done and Snooze, for those who may edit leads", () => {
    const { unmount } = renderAs(<TodayItem item={rahulNew} />);
    const mark = screen.getByRole("button", { name: "Mark Rahul Sharma contacted" });
    expect(mark).toHaveTextContent(messages.today.item.markContacted);
    expect(mark.dataset.variant).toBe("outline");
    expect(targetSize(mark).height).toBeGreaterThanOrEqual(44);
    expect(screen.queryByRole("button", { name: /^Done/ })).toBeNull();
    unmount();
    renderAs(<TodayItem item={rahulNew} />, member({ permissions: ["leads:view"] }));
    expect(screen.queryByRole("button", { name: "Mark Rahul Sharma contacted" })).toBeNull();
    expect(screen.getByRole("link", { name: "Call Rahul Sharma" })).toBeVisible();
  });

  it("shows a task on no lead by its title, with Done and Snooze and no one to call", () => {
    renderAs(<TodayItem item={standaloneDue} />);
    expect(within(listItem()).getByText("Renew the IATA licence")).toBeVisible();
    expect(screen.getByText("6:00 pm")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("button", { name: "Done: Renew the IATA licence" })).toBeVisible();
  });
});
