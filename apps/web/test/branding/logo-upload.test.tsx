// Sending the logo is sending any file (useSignedUpload): Try again picks up where it stopped, on the same signed
// upload; offline it fails at once rather than waiting at 0%; it can be stopped without calling it a failure; and the
// logo a confirm puts in the cache, with its five-minute link, never goes into the device's saved copy.
import { dehydrate, onlineManager } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLogoUpload } from "@/branding/use-logo";
import { dehydrateOptions } from "@/data/persistence";
import type * as UploadModule from "@/files/upload";
import { UploadError, uploadFile } from "@/files/upload";
import { messages } from "@/i18n/messages";
import { newQueryClient, withApp } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { subscriptionAnswer } from "../documents/subscription";
import { choose, logo, png, renderPanel, upload } from "./logo";

vi.mock("@/files/upload", async (importOriginal) => ({
  ...(await importOriginal<typeof UploadModule>()),
  uploadFile: vi.fn(),
}));

const words = messages.documents.branding.logo;
const replaced = { ...logo, attachmentId: "0199e7a0-0000-7000-8000-00000000a002", url: `${logo.url}&new` };
const signedUpload = { data: { attachmentId: replaced.attachmentId, upload } };
const countOf = (calls: string[], path: string) => calls.filter((call) => call === path).length;

beforeEach(() => {
  screenIs("wide");
  vi.mocked(uploadFile).mockReset();
});

afterEach(() => {
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

describe("sending the logo", () => {
  it("tries again where it stopped, on the same signed upload", async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new UploadError(0)).mockResolvedValueOnce();
    const api = renderPanel({
      "organization.logo.get": { data: null },
      "organization.logo.requestUpload": signedUpload,
      "organization.logo.confirmUpload": { data: replaced },
    });
    await screen.findByText(words.none);
    choose(png());
    expect(await screen.findByText(words.uploadFailed)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: words.tryAgain }));
    expect(await screen.findByRole("img", { name: words.alt })).toHaveAttribute("src", replaced.url);
    expect(vi.mocked(uploadFile).mock.calls.map(([sentTo]) => sentTo)).toEqual([upload, upload]);
    expect(countOf(api.calls, "organization.logo.requestUpload")).toBe(1);
  });

  it("fails at once when offline, rather than waiting at 0%", async () => {
    renderPanel({ "organization.logo.get": { data: null }, "organization.logo.requestUpload": "offline" });
    await screen.findByText(words.none);
    onlineManager.setOnline(false);
    choose(png());
    expect(await screen.findByText(messages.errors.network)).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("stops when asked, without calling it a failure", async () => {
    vi.mocked(uploadFile).mockImplementation(
      (_upload, _file, options) =>
        new Promise<void>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The upload was stopped", "AbortError"));
          });
        }),
    );
    renderPanel({ "organization.logo.get": { data: null }, "organization.logo.requestUpload": signedUpload });
    await screen.findByText(words.none);
    choose(png());
    await userEvent.click(await screen.findByRole("button", { name: words.stop }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: words.upload })).toBeEnabled();
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the confirmed logo off the device, even with no panel asking for it", async () => {
    vi.mocked(uploadFile).mockResolvedValue();
    stubApi({
      "subscription.get": subscriptionAnswer(),
      "organization.logo.requestUpload": signedUpload,
      "organization.logo.confirmUpload": { data: replaced },
    });
    const queryClient = newQueryClient();
    const { result } = renderHook(() => useLogoUpload(), { wrapper: withApp(queryClient) });
    act(() => {
      result.current.upload.mutate({
        file: png(),
        input: { fileName: "Sharma.png", contentType: "image/png", sizeBytes: 9 },
      });
    });
    await waitFor(() => {
      expect(result.current.upload.isSuccess).toBe(true);
    });
    const kept = dehydrate(queryClient, dehydrateOptions).queries.map((query) => JSON.stringify(query.queryKey));
    expect(
      queryClient.getQueryCache().findAll({ predicate: (query) => JSON.stringify(query.queryKey).includes("logo") }),
    ).toHaveLength(1);
    expect(kept.some((key) => key.includes("logo"))).toBe(false);
  });
});
