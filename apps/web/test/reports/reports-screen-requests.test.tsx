// The reports page asks for the overview tab's lead-flow chart together with the report, not after it.
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsScreen } from "@/reports/reports-screen";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ReportsScreen's first requests", () => {
  it("send the report and the lead-flow chart in one batch", async () => {
    screenIs("wide");
    stubApi({ "reports.overview": "never", "insights.dashboard": "never" });
    renderWithApi(<ReportsScreen />, newQueryClient(), member({ isOwner: true }));
    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled();
    });
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => decodeURIComponent(input as string));
    expect(urls.filter((url) => url.includes("reports.overview"))).toHaveLength(1);
    expect(urls.find((url) => url.includes("reports.overview"))).toContain("insights.dashboard");
  });
});
