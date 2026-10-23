// An import's progress (spec 3.2 steps 3 and 4): the screen asks every 2 seconds while the worker reads, checks or
// adds, and stops after; the add's bar says "642 of 1,157 rows", its numbers in mono, and, once 5 seconds of its pace
// are known, how long is left; a screen reader hears the count every 10 seconds or so, and at the end.
import type { ImportDetail } from "@travel-crm/contracts/imports";
import { act, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ImportCounts } from "@/imports/import-counts";
import { ImportProgress } from "@/imports/import-progress";
import { importRefetchInterval } from "@/imports/import-refetch";
import { renderAs } from "../organization/render";

const at = (
  status: ImportDetail["status"],
  sourceSheet: ImportDetail["sourceSheet"] = null,
  sourceMetaForm: ImportDetail["sourceMetaForm"] = null,
) => ({ status, sourceSheet, sourceMetaForm }) as ImportDetail;

/** The visible count, "642 of 1,157 rows": its words in sans, each number in mono (X5). */
const countLine = (text: string) =>
  screen.getByText(
    (_, element) =>
      element?.tagName === "SPAN" && element.textContent === text && !element.classList.contains("numbers"),
  );

describe("an import's progress", () => {
  it("polls every 2 seconds while reading, checking or adding, and stops after", () => {
    expect(importRefetchInterval(undefined)).toBe(false);
    for (const status of ["reading", "checking", "adding"] as const)
      expect(importRefetchInterval(at(status))).toBe(2000);
    for (const status of ["uploading", "matching", "checked", "done", "stopped", "failed", "unreadable"] as const) {
      expect(importRefetchInterval(at(status)), status).toBe(false);
    }
  });

  it("polls a Google Sheet's import while it waits to be matched, which the worker does itself", () => {
    expect(importRefetchInterval(at("matching", { sheetId: "0199e7a0-0000-7000-8000-0000000000e1" }))).toBe(2000);
    expect(importRefetchInterval(at("checked", { sheetId: "0199e7a0-0000-7000-8000-0000000000e1" }))).toBe(false);
  });

  it("polls a Facebook form's last-30-days import the same way", () => {
    const form = { formId: "0199e7a0-0000-7000-8000-0000000000f2" };
    expect(importRefetchInterval(at("matching", null, form))).toBe(2000);
    expect(importRefetchInterval(at("checked", null, form))).toBe(false);
  });

  it("says 642 of 1,157 rows and About a minute left", () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    renderAs(<ImportProgress done={642} total={1157} since={since} label="Adding leads" />);
    const line = countLine("642 of 1,157 rows");
    expect(line).toBeVisible();
    expect(within(line).getByText("642")).toHaveClass("numbers");
    expect(within(line).getByText("1,157")).toHaveClass("numbers");
    expect(screen.getByText("About a minute left")).toBeVisible();
    expect(screen.getByRole("progressbar", { name: "Adding leads" })).toBeVisible();
  });

  it("says how many minutes are left at a slow pace, and nothing before 5 seconds of it", () => {
    const { unmount } = renderAs(
      <ImportProgress done={100} total={10_000} since={new Date(Date.now() - 60_000).toISOString()} label="Adding" />,
    );
    expect(screen.getByText("About 99 minutes left")).toBeVisible();
    unmount();
    renderAs(
      <ImportProgress done={10} total={1157} since={new Date(Date.now() - 2_000).toISOString()} label="Adding" />,
    );
    expect(countLine("10 of 1,157 rows")).toBeVisible();
    expect(screen.queryByText(/left$/)).toBeNull();
  });

  it("says nothing of time left once every row is done (W6)", () => {
    renderAs(
      <ImportProgress done={1157} total={1157} since={new Date(Date.now() - 60_000).toISOString()} label="Adding" />,
    );
    expect(countLine("1,157 of 1,157 rows")).toBeVisible();
    expect(screen.queryByText(/left$/)).toBeNull();
  });

  it("tells a screen reader the count every 10 seconds or so, though it moves every 2, and at once at the end (X6)", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    try {
      const since = new Date(Date.now() - 60_000).toISOString();
      const progress = (done: number) => <ImportProgress done={done} total={100} since={since} label="Adding" />;
      const { rerender } = renderAs(progress(10));
      const said = () => screen.getByRole("status").textContent;
      expect(said()).toBe("10 of 100 rows");
      rerender(progress(20));
      expect(said()).toBe("10 of 100 rows");
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(said()).toBe("20 of 100 rows");
      rerender(progress(30));
      expect(said()).toBe("20 of 100 rows");
      rerender(progress(100));
      expect(said()).toBe("100 of 100 rows");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows counts as labelled values, the numbers in mono", () => {
    renderAs(
      <ImportCounts
        items={[
          { label: "New leads", count: 1094 },
          { label: "Rows not added", count: 129 },
        ]}
      />,
    );
    const count = screen.getByText("1,094");
    expect(count).toHaveClass("numbers");
    expect(screen.getByText("New leads")).toBeVisible();
    expect(screen.getByText("129")).toBeVisible();
  });
});
