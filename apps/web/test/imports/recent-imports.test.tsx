// Recent imports (spec 3.2 step 1): the person's last ten, each with its file name linking to its page, its day, its
// rows and how many were added, and its state as a badge in the spec's tones; nothing when there are none.
import type { RecentImport } from "@travel-crm/contracts/imports";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ImportStatusBadge } from "@/imports/import-status-badge";
import { RecentImports } from "@/imports/recent-imports";
import { renderAs } from "../organization/render";

const recent = (overrides: Partial<RecentImport>): RecentImport => ({
  id: "0199e7a0-0000-7000-8000-0000000000c1",
  fileName: "enquiries-sept-2026.xlsx",
  // 18:45 UTC on 11 Sept is already 12 Sept in India.
  createdAt: "2026-09-11T18:45:00.000Z",
  status: "done",
  rowsTotal: 1286,
  rowsAdded: 1094,
  ...overrides,
});

describe("RecentImports", () => {
  it("lists recent imports with their badges, each linking to its page", () => {
    renderAs(
      <RecentImports
        imports={[
          recent({}),
          recent({
            id: "0199e7a0-0000-7000-8000-0000000000c2",
            fileName: "website-leads.csv",
            status: "matching",
            rowsAdded: 0,
            rowsTotal: 214,
          }),
        ]}
        hrefOf={(id) => `/leads/import/${id}`}
      />,
    );
    expect(screen.getByRole("heading", { name: "Recent imports" })).toBeVisible();
    const first = screen.getByRole("link", { name: "enquiries-sept-2026.xlsx" });
    expect(first).toHaveAttribute("href", "/leads/import/0199e7a0-0000-7000-8000-0000000000c1");
    const items = screen.getAllByRole("listitem");
    expect(within(items[0] ?? document.body).getByText(/12 Sept|12 Sep/)).toBeVisible();
    // The words in sans, only the numbers in mono (X5).
    const meta = within(items[0] ?? document.body).getByText(
      (_, element) => element?.tagName === "SPAN" && element.textContent === "1,286 rows · 1,094 added",
    );
    expect(meta).not.toHaveClass("numbers");
    expect(within(meta).getByText("1,286")).toHaveClass("numbers");
    expect(within(meta).getByText("1,094")).toHaveClass("numbers");
    expect(within(items[0] ?? document.body).getByText("Done")).toBeVisible();
    expect(within(items[1] ?? document.body).getByText("Waiting for you")).toBeVisible();
  });

  it("shows nothing when there are none", () => {
    const { container } = renderAs(<RecentImports imports={[]} hrefOf={(id) => id} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("badges Waiting for you in amber, Done in green, Failed and Can't read in red, the rest neutral", () => {
    const tones = {
      matching: ["Waiting for you", "attention"],
      checked: ["Waiting for you", "attention"],
      done: ["Done", "good"],
      failed: ["Failed", "bad"],
      unreadable: ["Can't read", "bad"],
      reading: ["Reading", "neutral"],
      checking: ["Checking", "neutral"],
      adding: ["Adding", "neutral"],
      stopped: ["Stopped", "neutral"],
      cancelled: ["Cancelled", "neutral"],
      expired: ["Expired", "neutral"],
    } as const;
    for (const [status, [word, tone]] of Object.entries(tones)) {
      const { unmount } = renderAs(<ImportStatusBadge status={status as keyof typeof tones} />);
      expect(screen.getByText(word).closest("span")?.className, status).toContain(`status-${tone}-`);
      unmount();
    }
  });
});
