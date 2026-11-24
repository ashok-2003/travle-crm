// A photo or video inside a bubble sits in a fixed frame (inbox part 2, item 14): a placeholder fills it while the file loads, the
// picture covers it, and a file that failed or is gone says so in words, never "not loaded yet".
import type { ChatMessage, MediaLink } from "@travel-crm/contracts/inbox";
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaViewerProvider } from "@/inbox/media/media-viewer";
import { MessageMedia } from "@/inbox/media/message-media";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { wantsStream, wireResponse } from "../support/trpc-wire";

function answerLink(contentType: string, freshEachTime = false) {
  let asked = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { headers?: unknown }) => {
      const paths = decodeURIComponent(new URL(url, "http://localhost").pathname.replace("/api/trpc/", "")).split(",");
      asked += 1;
      const link: MediaLink = {
        url: freshEachTime ? `https://files.example/m1?try=${String(asked)}` : "https://files.example/m1",
        fileName: "a",
        contentType,
        sizeBytes: 2048,
      };
      return Promise.resolve(
        wireResponse(
          paths.map(() => ({ result: { data: link } })),
          wantsStream(init),
        ),
      );
    }),
  );
}

const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  direction: "in",
  origin: "customer",
  byAi: false,
  kind: "image",
  body: null,
  caption: null,
  fileName: null,
  latitude: null,
  longitude: null,
  quoted: null,
  quoteDropped: false,
  sentAt: null,
  deliveredAt: null,
  readAt: null,
  reaction: null,
  status: "received",
  failureCode: null,
  mediaState: "stored",
  sentBy: null,
  occurredAt: "2026-10-26T10:00:00.000Z",
  starred: false,
  aiText: null,
  buttons: null,
  tapped: false,
  ...extra,
});

const show = (extra: Partial<ChatMessage> = {}) =>
  renderWithApi(<MessageMedia message={message(extra)} />, newQueryClient());

describe("a photo or video in a bubble", () => {
  beforeEach(() => {
    screenIs("phone");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sits in a fixed frame, with a placeholder until the picture has loaded", async () => {
    answerLink("image/jpeg");
    const { container } = show();
    const picture = await screen.findByRole("img", { name: "Photo" });
    expect(picture.parentElement).toHaveClass("w-64", "max-w-full", "aspect-[4/5]");
    expect(picture).toHaveClass("object-cover", "size-full");
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    fireEvent.load(picture);
    expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  });

  it("keeps its frame, says so and is not tappable when the browser cannot load the photo", async () => {
    answerLink("image/jpeg");
    renderWithApi(
      <MediaViewerProvider messages={[message()]} customerName="Rahul" people={{}}>
        <MessageMedia message={message()} />
      </MediaViewerProvider>,
      newQueryClient(),
    );
    expect(await screen.findByRole("button", { name: "Open the photo" })).toBeInTheDocument();
    fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
    const words = screen.getByText("Photo not available");
    expect(words.parentElement).toHaveClass("w-64", "max-w-full", "aspect-[4/5]");
    expect(screen.getByText("Open it on the phone")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open the photo" })).toBeNull();
  });

  it("tries again when the same message gets a fresh link", async () => {
    answerLink("image/jpeg", true);
    const client = newQueryClient();
    renderWithApi(<MessageMedia message={message()} />, client);
    fireEvent.error(await screen.findByRole("img", { name: "Photo" }));
    expect(screen.getByText("Photo not available")).toBeInTheDocument();
    await act(() => client.invalidateQueries());
    expect(await screen.findByRole("img", { name: "Photo" })).toHaveAttribute("src", "https://files.example/m1?try=2");
  });

  it("puts a video thumbnail in the same frame", async () => {
    answerLink("video/mp4");
    show({ kind: "video" });
    const video = await screen.findByLabelText("Video");
    expect(video.parentElement).toHaveClass("w-64", "max-w-full", "aspect-video");
  });

  it.each([
    ["unavailable", "failed", "Photo not available"],
    ["media_expired", "expired", "Photo not available"],
    ["too_big", "failed", "Too big to keep"],
    ["bad_type", "failed", "A file type we don't keep"],
  ] as const)("words a stored %s file in plain language", (failureCode, mediaState, words) => {
    show({ failureCode, mediaState });
    expect(screen.getByText(words)).toBeInTheDocument();
    expect(screen.getByText("Open it on the phone")).toBeInTheDocument();
    expect(screen.queryByText(/not loaded yet/)).toBeNull();
  });

  it("calls a document that is gone a file", () => {
    show({ kind: "document", failureCode: "unavailable", mediaState: "failed" });
    expect(screen.getByText("File not available")).toBeInTheDocument();
  });

  it("keeps the storage-full wording", () => {
    show({ failureCode: "storage_full", mediaState: "failed" });
    expect(screen.getByText("This photo could not be saved.")).toBeInTheDocument();
  });
});
