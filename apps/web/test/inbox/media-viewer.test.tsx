// The photo and video viewer and the document card (audit 2 and 3): a tap on a photo opens the chat's photos and videos
// full screen, with the sender and time, the caption, a way to the next and the previous one, zoom, and Download that asks
// the api for a saving link. Escape closes it. A document shows its name and size, with Open and Download apart.
import type { ChatMessage, MediaLink } from "@travel-crm/contracts/inbox";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentCard } from "@/inbox/media/document-card";
import { MediaViewerProvider, useOpenMedia } from "@/inbox/media/media-viewer";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const loadPage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/navigate", () => ({ loadPage, replacePage: vi.fn() }));

/** Every batched call is answered: a link for each message, naming whether it was asked to download. */
function answerLinks() {
  const asked: { messageId: string; download: boolean }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: { body?: string }) => {
      const paths = decodeURIComponent(new URL(url, "http://localhost").pathname.replace("/api/trpc/", "")).split(",");
      const body = JSON.parse(init.body ?? "{}") as Record<string, { messageId: string; download?: boolean }>;
      const items = paths.map((_, index) => {
        const input = body[String(index)] ?? { messageId: "" };
        asked.push({ messageId: input.messageId, download: input.download === true });
        const link: MediaLink = {
          url: `https://files.example/${input.messageId}${input.download === true ? "?save" : ""}`,
          fileName: "Houseboat.jpg",
          contentType: "image/jpeg",
          sizeBytes: 2048,
        };
        return { result: { data: link } };
      });
      return Promise.resolve(Response.json(items));
    }),
  );
  return asked;
}

const photo = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  direction: "in",
  origin: "customer",
  kind: "image",
  body: null,
  caption: null,
  fileName: null,
  latitude: null,
  longitude: null,
  quoted: null,
  reaction: null,
  status: "received",
  failureCode: null,
  mediaState: "stored",
  sentBy: null,
  occurredAt: "2026-10-26T10:00:00.000Z",
  starred: false,
  ...extra,
});

function Opener({ id }: { id: string }) {
  const open = useOpenMedia();
  return (
    <button
      type="button"
      onClick={() => {
        open?.(id);
      }}
    >
      Open {id}
    </button>
  );
}

describe("the media viewer", () => {
  beforeEach(() => {
    screenIs("wide");
    loadPage.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const messages = [
    photo("m1", { caption: "The houseboat" }),
    photo("m2", { direction: "out", origin: "staff_crm", sentBy: "u1", kind: "video" }),
    photo("m3"),
  ];
  const renderViewer = () =>
    renderWithApi(
      <MediaViewerProvider messages={messages} customerName="Rahul Mehta" people={{ u1: "Asha Sharma" }}>
        <Opener id="m1" />
      </MediaViewerProvider>,
      newQueryClient(),
    );

  it("opens a photo with its sender, caption and place among the chat's photos and videos", async () => {
    answerLinks();
    renderViewer();
    await userEvent.click(screen.getByRole("button", { name: "Open m1" }));
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByText("From Rahul Mehta")).toBeInTheDocument();
    expect(within(viewer).getByText(/1 of 3/)).toBeInTheDocument();
    expect(within(viewer).getByText("The houseboat")).toBeInTheDocument();
    expect(await within(viewer).findByRole("img", { name: "The houseboat" })).toHaveAttribute(
      "src",
      "https://files.example/m1",
    );
    expect(within(viewer).queryByRole("button", { name: "Previous" })).toBeNull();
  });

  it("goes to the next and the previous with the buttons and the arrow keys", async () => {
    answerLinks();
    renderViewer();
    await userEvent.click(screen.getByRole("button", { name: "Open m1" }));
    const viewer = await screen.findByRole("dialog");
    await userEvent.click(within(viewer).getByRole("button", { name: "Next" }));
    expect(within(viewer).getByText("From Asha Sharma")).toBeInTheDocument();
    expect(within(viewer).getByText(/2 of 3/)).toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    expect(within(viewer).getByText(/3 of 3/)).toBeInTheDocument();
    expect(within(viewer).queryByRole("button", { name: "Next" })).toBeNull();
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(viewer).getByText(/2 of 3/)).toBeInTheDocument();
  });

  it("zooms the photo with its buttons", async () => {
    answerLinks();
    renderViewer();
    await userEvent.click(screen.getByRole("button", { name: "Open m1" }));
    const picture = await screen.findByRole("img", { name: "The houseboat" });
    expect(picture.style.transform).toContain("scale(1)");
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(picture.style.transform).toContain("scale(1.5)");
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(picture.style.transform).toContain("scale(1)");
  });

  it("downloads through a link made for saving, and closes on Escape", async () => {
    const asked = answerLinks();
    renderViewer();
    await userEvent.click(screen.getByRole("button", { name: "Open m1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Download" }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("https://files.example/m1?save");
    });
    expect(asked.some((call) => call.messageId === "m1" && call.download)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("a document card", () => {
  beforeEach(() => {
    screenIs("wide");
    loadPage.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("names the file and its size, opens a PDF in a tab and downloads apart from opening", async () => {
    const asked = answerLinks();
    renderWithApi(
      <DocumentCard
        messageId="d1"
        link={{
          url: "https://files.example/d1",
          fileName: "Kerala itinerary.pdf",
          contentType: "application/pdf",
          sizeBytes: 860 * 1024,
        }}
      />,
      newQueryClient(),
    );
    expect(screen.getByText("Kerala itinerary.pdf")).toBeInTheDocument();
    expect(screen.getByText(/PDF · 860 KB/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Kerala itinerary.pdf" })).toHaveAttribute(
      "href",
      "https://files.example/d1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Download Kerala itinerary.pdf" }));
    await waitFor(() => {
      expect(loadPage).toHaveBeenCalledWith("https://files.example/d1?save");
    });
    expect(asked).toEqual([{ messageId: "d1", download: true }]);
  });

  it("offers only Download for a file the browser cannot show", () => {
    renderWithApi(
      <DocumentCard
        messageId="d2"
        link={{
          url: "https://files.example/d2",
          fileName: "Costs.xlsx",
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: 20_000,
        }}
      />,
      newQueryClient(),
    );
    expect(screen.queryByRole("link", { name: /Open/ })).toBeNull();
    expect(screen.getByText(/Spreadsheet/)).toBeInTheDocument();
  });
});
