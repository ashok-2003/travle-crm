// An import's progress (spec 3.2 steps 3 and 4): the screen asks every 2 seconds while the worker reads, checks or
// adds, and stops after; the add's bar says "642 of 1,157 rows" and, once 5 seconds of its pace are known, how long
// is left.
import type { ImportDetail } from "@travel-crm/contracts/imports";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportCounts } from "@/imports/import-counts";
import { ImportProgress } from "@/imports/import-progress";
import { importRefetchInterval } from "@/imports/import-refetch";
import { renderAs } from "../organization/render";

const at = (status: ImportDetail["status"]) => ({ status }) as ImportDetail;

describe("an import's progress", () => {
  it("polls every 2 seconds while reading, checking or adding, and stops after", () => {
    expect(importRefetchInterval(undefined)).toBe(false);
    for (const status of ["reading", "checking", "adding"] as const)
      expect(importRefetchInterval(at(status))).toBe(2000);
    for (const status of ["uploading", "matching", "checked", "done", "stopped", "failed", "unreadable"] as const) {
      expect(importRefetchInterval(at(status)), status).toBe(false);
    }
  });

  it("says 642 of 1,157 rows and About a minute left", () => {
    const since = new Date(Date.now() - 60_000).toISOString();
    renderAs(<ImportProgress done={642} total={1157} since={since} label="Adding leads" />);
    expect(screen.getByText("642 of 1,157 rows")).toBeVisible();
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
    expect(screen.getByText("10 of 1,157 rows")).toBeVisible();
    expect(screen.queryByText(/left$/)).toBeNull();
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
