// A trip in one line, as the list, Today and the known contact show it (spec 3.3): destination · when · travellers,
// a month as "Dec" this year and "Jan 2027" another, a range as "14 – 20 Nov", flexible dates as "dates open".
import type { TripSummary } from "@travel-crm/contracts/crm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTripLine } from "@/leads/trip-line";
import { renderPieceHook } from "./render";

const trip = (summary: Partial<TripSummary>): TripSummary => ({
  destinationName: null,
  when: { kind: "unknown" },
  adults: null,
  childrenCount: 0,
  ...summary,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T06:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTripLine", () => {
  it("writes Kashmir · Dec · 2 adults, 1 child; Goa · Jan 2027 · 6 adults; Kedarnath · 14 – 20 Nov · 4 adults; Manali · dates open · 2 adults", () => {
    const line = renderPieceHook(() => useTripLine()).result.current;
    expect(
      line(
        trip({ destinationName: "Kashmir", when: { kind: "month", month: "2026-12" }, adults: 2, childrenCount: 1 }),
      ),
    ).toBe("Kashmir · Dec · 2 adults, 1 child");
    expect(line(trip({ destinationName: "Goa", when: { kind: "month", month: "2027-01" }, adults: 6 }))).toBe(
      "Goa · Jan 2027 · 6 adults",
    );
    expect(
      line(
        trip({
          destinationName: "Kedarnath",
          when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
          adults: 4,
        }),
      ),
    ).toBe("Kedarnath · 14 – 20 Nov · 4 adults");
    expect(line(trip({ destinationName: "Manali", when: { kind: "flexible" }, adults: 2 }))).toBe(
      "Manali · dates open · 2 adults",
    );
  });

  it("spans months and years, counts one adult and children alone, and says when nothing is known", () => {
    const line = renderPieceHook(() => useTripLine()).result.current;
    expect(line(trip({ when: { kind: "dates", from: "2026-11-28", to: "2026-12-03" }, adults: 1 }))).toBe(
      "28 Nov – 3 Dec · 1 adult",
    );
    expect(line(trip({ when: { kind: "dates", from: "2027-01-10", to: "2027-01-16" } }))).toBe("10 – 16 Jan 2027");
    expect(line(trip({ when: { kind: "dates", from: "2026-12-28", to: "2027-01-03" } }))).toBe(
      "28 Dec 2026 – 3 Jan 2027",
    );
    expect(line(trip({ when: { kind: "dates", from: "2026-11-14", to: "2026-11-14" } }))).toBe("14 Nov");
    expect(line(trip({ destinationName: "Bali", childrenCount: 2 }))).toBe("Bali · 2 children");
    expect(line(trip({}))).toBe("No trip details yet");
  });
});
