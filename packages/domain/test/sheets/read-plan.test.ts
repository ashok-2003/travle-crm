// How much of the tab a check reads (S18): the window from the cursor, Sync now, the daily full read in the agency's
// zone, and the follow-up when the header changed or rows were deleted.
import { describe, expect, it } from "vitest";
import { followUpFullRead, dailyReadDue, decideRead, headerHashOf, rowHash } from "../../src/sheets/index.js";

const connection = (cursorRow: number, lastFullReadAt: Date | null = new Date("2026-10-19T05:00:00Z")) => ({
  cursorRow,
  lastFullReadAt,
});
const now = new Date("2026-10-19T08:00:00Z");
const base = { now, timeZone: "Asia/Kolkata", firstPendingRow: null };

describe("decideRead", () => {
  it("reads from the cursor less 100 rows, never before row 2", () => {
    expect(decideRead({ ...base, connection: connection(5), mode: "scheduled" })).toEqual({
      fromRow: 2,
      full: false,
      reason: "window",
    });
    expect(decideRead({ ...base, connection: connection(300), mode: "scheduled" })).toMatchObject({
      fromRow: 200,
      full: false,
    });
    expect(decideRead({ ...base, connection: connection(102), mode: "scheduled" }).fromRow).toBe(2);
    expect(decideRead({ ...base, connection: connection(103), mode: "scheduled" }).fromRow).toBe(3);
  });

  it("reads from the first pending row when it is earlier than the window", () => {
    expect(decideRead({ ...base, connection: connection(300), mode: "scheduled", firstPendingRow: 12 }).fromRow).toBe(
      12,
    );
    expect(decideRead({ ...base, connection: connection(300), mode: "scheduled", firstPendingRow: 290 }).fromRow).toBe(
      200,
    );
  });

  it("reads the whole tab for Sync now and Check again", () => {
    for (const mode of ["sync-now", "recheck"] as const) {
      expect(decideRead({ ...base, connection: connection(5000), mode })).toEqual({
        fromRow: 2,
        full: true,
        reason: mode,
      });
    }
  });

  it("reads the whole tab on the first check, and on the first after 03:00 each day", () => {
    expect(decideRead({ ...base, connection: connection(500, null), mode: "scheduled" })).toMatchObject({
      fromRow: 2,
      full: true,
      reason: "daily",
    });
    // 03:00 in India on the 20th is 21:30 UTC on the 19th.
    const yesterday = new Date("2026-10-19T10:00:00Z");
    expect(
      decideRead({
        connection: connection(500, yesterday),
        mode: "scheduled",
        now: new Date("2026-10-19T21:31:00Z"),
        timeZone: "Asia/Kolkata",
        firstPendingRow: null,
      }),
    ).toMatchObject({ full: true, reason: "daily" });
  });
});

describe("dailyReadDue", () => {
  it("makes the first check after 03:00 in the agency's zone each day a full read, once", () => {
    for (const [timeZone, boundary] of [
      ["Asia/Kolkata", "2026-10-19T21:30:00Z"],
      ["America/Los_Angeles", "2026-10-20T10:00:00Z"],
    ] as const) {
      const lastFull = new Date(new Date(boundary).getTime() - 20 * 3_600_000);
      const justBefore = new Date(new Date(boundary).getTime() - 60_000);
      const atBoundary = new Date(boundary);
      expect(dailyReadDue(lastFull, justBefore, timeZone), `${timeZone} 02:59`).toBe(false);
      expect(dailyReadDue(lastFull, atBoundary, timeZone), `${timeZone} 03:00`).toBe(true);
      // Once read, the same day asks no more.
      expect(dailyReadDue(atBoundary, new Date(atBoundary.getTime() + 3_600_000), timeZone)).toBe(false);
      expect(
        dailyReadDue(
          new Date(atBoundary.getTime() + 600_000),
          new Date(atBoundary.getTime() + 12 * 3_600_000),
          timeZone,
        ),
      ).toBe(false);
      // The next day's 03:00 asks again.
      expect(dailyReadDue(atBoundary, new Date(atBoundary.getTime() + 24 * 3_600_000), timeZone)).toBe(true);
    }
    expect(dailyReadDue(null, now, "Asia/Kolkata")).toBe(true);
  });
});

describe("followUpFullRead", () => {
  const header = ["Name", "Phone"];
  it("asks for a full read when the header changed or the sheet has fewer rows than the cursor", () => {
    const stored = headerHashOf(header);
    const sheet = (headerHash: Uint8Array | null, cursorRow: number) => ({ cursorRow, headerHash });
    expect(followUpFullRead(sheet(stored, 50), stored, { lastRow: 50 })).toBeNull();
    expect(followUpFullRead(sheet(stored, 50), stored, { lastRow: 80 })).toBeNull();
    expect(followUpFullRead(sheet(stored, 50), headerHashOf(["Name", "Mobile"]), { lastRow: 50 })).toBe(
      "header-changed",
    );
    expect(followUpFullRead(sheet(stored, 50), stored, { lastRow: 49 })).toBe("rows-deleted");
    // A connection that has no header hash yet has nothing to compare.
    expect(followUpFullRead(sheet(null, 50), stored, { lastRow: 50 })).toBeNull();
    expect(Buffer.from(headerHashOf([" Name", "Phone  "])).equals(Buffer.from(rowHash(["Name", "Phone"])))).toBe(true);
  });
});
