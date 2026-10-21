// An export's progress (B41): how far the worker has got, never past the end, however its counts land (W12). The
// registry's Progress shows its value only in its indicator's place, so that is what is read.
import { screen } from "@testing-library/react";
import type { ExportDetail } from "@travel-crm/contracts/exports";
import { describe, expect, it } from "vitest";
import { ExportProgress } from "@/exports/export-progress";
import { renderAs } from "../organization/render";

function making(rowsDone: number, rowsTotal: number): ExportDetail {
  return {
    id: "0199e7a0-0000-7000-8000-0000000000e1",
    kind: "leads",
    format: "xlsx",
    status: "making",
    failureReason: null,
    rowsTotal,
    rowsDone,
    file: null,
    createdAt: "2026-10-20T05:00:00.000Z",
    readyAt: null,
    expiresAt: null,
  };
}

/** How far the bar is filled: the indicator slides in from the left by the part not done. */
function filled(name: string) {
  const indicator = screen
    .getByRole("progressbar", { name })
    .querySelector<HTMLElement>("[data-slot=progress-indicator]");
  return indicator?.style.transform;
}

describe("ExportProgress", () => {
  it("says how far the file has got", () => {
    renderAs(<ExportProgress detail={making(78, 312)} rowsWord="leads" />);
    expect(filled("Preparing 312 leads…")).toBe("translateX(-75%)");
  });

  it("stops at the end when more rows are done than were counted", () => {
    renderAs(<ExportProgress detail={making(320, 312)} rowsWord="leads" />);
    expect(filled("Preparing 312 leads…")).toBe("translateX(-0%)");
  });
});
