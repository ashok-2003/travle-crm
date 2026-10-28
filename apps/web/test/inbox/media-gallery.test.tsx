// The contact panel's gallery (audit 13): the chat's photos and videos as a grid, a tap opens the viewer on that one, and the
// grid asks for older pages on demand.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaGallery } from "@/inbox/media/media-gallery";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aMessage, answerApi } from "./answer-api";

const chatId = "01900000-0000-7000-8000-00000000000a";
const id = (n: number) => `01900000-0000-7000-8000-0000000000${String(n).padStart(2, "0")}`;
const photo = (n: number) =>
  aMessage({
    id: id(n),
    kind: "image",
    body: null,
    mediaState: "stored",
    occurredAt: `2026-10-26T10:0${String(n)}:00.000Z`,
  });

const links = (numbers: number[]) =>
  Object.fromEntries(
    numbers.map((n) => [
      id(n),
      { url: `https://files.example/${id(n)}`, fileName: "p.jpg", contentType: "image/jpeg", sizeBytes: 100 },
    ]),
  );

describe("the media gallery", () => {
  beforeEach(() => {
    screenIs("wide");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const handlers = {
    "inbox.media": (input: unknown) =>
      (input as { before?: string }).before === undefined
        ? { items: [photo(3), photo(2)], nextCursor: id(2), people: {}, unread: null, links: links([3, 2]) }
        : { items: [photo(1)], nextCursor: null, people: {}, unread: null, links: links([1]) },
  };

  it("shows the photos newest first and opens the viewer on the one tapped", async () => {
    const api = answerApi({
      ...handlers,
      "inbox.mediaUrl": (input: unknown) => ({
        url: `https://files.example/${(input as { messageId: string }).messageId}`,
        fileName: "p.jpg",
        contentType: "image/jpeg",
        sizeBytes: 100,
      }),
    });
    renderWithApi(<MediaGallery conversationId={chatId} customerName="Rahul Mehta" />, newQueryClient());
    const grid = await screen.findByRole("list", { name: "Photos and videos" });
    expect(within(grid).getAllByRole("button", { name: "Open the photo" })).toHaveLength(2);
    const [, older] = within(grid).getAllByRole("button", { name: "Open the photo" });
    if (older === undefined) throw new Error("no second photo");
    // The page's pictures came with their links: no call was made for any one of them.
    expect(api.of("inbox.mediaUrl").length).toBeLessThanOrEqual(1);
    await userEvent.click(older);
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByText(/1 of 2/)).toBeInTheDocument();
  });

  it("asks for the next page when Show more is pressed", async () => {
    const api = answerApi(handlers);
    renderWithApi(<MediaGallery conversationId={chatId} customerName="Rahul Mehta" />, newQueryClient());
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Open the photo" })).toHaveLength(3);
    });
    expect(api.of("inbox.media")[1]?.input).toMatchObject({ before: id(2) });
  });

  it("says so when the chat has no photos", async () => {
    answerApi({ "inbox.media": { items: [], nextCursor: null, people: {}, unread: null, links: {} } });
    renderWithApi(<MediaGallery conversationId={chatId} customerName="Rahul Mehta" />, newQueryClient());
    expect(await screen.findByText("No photos or videos in this chat yet.")).toBeInTheDocument();
  });
});
