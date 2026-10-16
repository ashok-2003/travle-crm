// Downloading through a short-lived link (the papers' and the PDFs' alike): the link is asked for when pressed and the
// browser goes to it; offline it fails at once rather than opening the download whenever the connection returns; and
// a failure's sentence stays until it is dismissed.
import { onlineManager } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDownload } from "@/files/use-download";
import { messages } from "@/i18n/messages";
import { loadPage } from "@/lib/navigate";
import { newQueryClient, withApp } from "../organization/api";
import { refusal, unanswered } from "../support/api-errors";

vi.mock("@/lib/navigate", () => ({ loadPage: vi.fn(), replacePage: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const link = { url: "https://files.example.test/SMPL-2026-0001.pdf?signature=1", expiresAt: "2026-10-16T05:35:00Z" };

const renderDownload = (linkFor: (id: string) => Promise<typeof link>) =>
  renderHook(() => useDownload(linkFor), { wrapper: withApp(newQueryClient()) });

beforeEach(() => {
  vi.mocked(loadPage).mockReset();
  toast.error.mockClear();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe("useDownload", () => {
  it("asks for the link when pressed, and goes to it", async () => {
    const linkFor = vi.fn<(id: string) => Promise<typeof link>>().mockResolvedValue(link);
    const { result } = renderDownload(linkFor);
    act(() => {
      result.current.mutate("0199e7a0-0000-7000-8000-0000000000d1");
    });
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith(link.url);
    });
    expect(linkFor).toHaveBeenCalledWith("0199e7a0-0000-7000-8000-0000000000d1");
  });

  it("fails at once when offline, saying so until dismissed", async () => {
    onlineManager.setOnline(false);
    const linkFor = vi.fn<(id: string) => Promise<typeof link>>().mockRejectedValue(unanswered());
    const { result } = renderDownload(linkFor);
    act(() => {
      result.current.mutate("0199e7a0-0000-7000-8000-0000000000d1");
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(messages.errors.network, { duration: Infinity });
    });
    expect(linkFor).toHaveBeenCalled();
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("shows a refusal's sentence until dismissed", async () => {
    const { result } = renderDownload(() => Promise.reject(refusal(404, "DOCUMENT_NOT_READY")));
    act(() => {
      result.current.mutate("0199e7a0-0000-7000-8000-0000000000d1");
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(messages.errors.reasons.DOCUMENT_NOT_READY, { duration: Infinity });
    });
  });
});
