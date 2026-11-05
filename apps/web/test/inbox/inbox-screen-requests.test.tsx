// The Inbox asks for the chat list's owner names and tags together with its status, not after the list has loaded.
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { InboxScreen } from "@/inbox/inbox-screen";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

vi.mock("next/navigation", () => ({ usePathname: () => "/inbox", useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InboxScreen's first requests", () => {
  it("send the status, the owners and the tags in one batch", async () => {
    screenIs("wide");
    stubApi({ "inbox.status": "never", "leads.owners": "never", "inbox.tags": "never" });
    renderWithApi(
      <SidebarProvider>
        <InboxScreen conversationId={null} />
      </SidebarProvider>,
      newQueryClient(),
      member({ isOwner: true }),
    );
    await waitFor(() => {
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled();
    });
    const urls = vi.mocked(globalThis.fetch).mock.calls.map(([input]) => decodeURIComponent(input as string));
    const first = urls.find((url) => url.includes("inbox.status"));
    expect(first).toContain("leads.owners");
    expect(first).toContain("inbox.tags");
  });
});
