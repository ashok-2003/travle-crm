// The reply box's own promises (audit 5-7): words typed in a chat are kept for it and come back, a pasted picture waits in
// the box with its preview, a file going up shows its progress and can be stopped, and the chat shows it as a bubble while it
// does. The api is a fake that waits for each call to be answered.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatDropZone } from "@/inbox/chat-drop";
import { Composer } from "@/inbox/composer";
import { draftKey } from "@/inbox/forward-dialog";
import { PendingBubble } from "@/inbox/pending-bubble";
import { readTabValue } from "@/lib/tab-storage";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const upload = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/files/upload", () => ({ uploadFile: upload.run, UploadError: class extends Error {} }));

const header = (id: string): ConversationHeader => ({
  id,
  phone: "+919876543210",
  name: "Rahul Mehta",
  personId: null,
  lead: null,
  pastCustomer: false,
  windowOpenUntil: "2099-01-01T00:00:00.000Z",
  lastInboundAt: "2026-10-26T10:00:00.000Z",
  needsReply: false,
  trip: { destination: null, travelMonth: null },
  optedOut: false,
  agreed: true,
  state: "open",
  tags: [],
  pinned: false,
  archived: false,
  snoozedUntil: null,
  replying: [],
});
const chatA = "01900000-0000-7000-8000-00000000000a";
const chatB = "01900000-0000-7000-8000-00000000000b";

const render = (id: string) =>
  renderWithApi(<Composer header={header(id)} windowOpenUntil="2099-01-01T00:00:00.000Z" />, newQueryClient());
const box = () => screen.getByRole("combobox", { name: "Message" });

describe("the reply box", () => {
  beforeEach(() => {
    screenIs("wide");
    window.sessionStorage.clear();
    upload.run.mockReset();
    fakeApi();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a chat's words for when the person comes back, and a chat of its own has its own", async () => {
    const first = render(chatA);
    await userEvent.type(box(), "Houseboat quote?");
    expect(readTabValue(draftKey(chatA))).toBe("Houseboat quote?");
    first.unmount();
    const other = render(chatB);
    expect(box()).toHaveValue("");
    other.unmount();
    render(chatA);
    expect(box()).toHaveValue("Houseboat quote?");
  });

  it("takes words forwarded from another chat, which wait under the same key", () => {
    window.sessionStorage.setItem(`travel-crm.${draftKey(chatA)}`, "Forwarded words");
    render(chatA);
    expect(box()).toHaveValue("Forwarded words");
  });

  it("clears the kept words once the message is sent", async () => {
    const api = fakeApi();
    render(chatA);
    await userEvent.type(box(), "Hello");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    api.calls.find((call) => call.path === "inbox.send")?.answer({ messageId: "m1", status: "queued" });
    await waitFor(() => {
      expect(box()).toHaveValue("");
    });
    expect(readTabValue(draftKey(chatA))).toBeNull();
  });

  it("holds a pasted picture in the box with a small preview of it", async () => {
    render(chatA);
    const picture = new File([new Uint8Array(10)], "houseboat.png", { type: "image/png" });
    act(() => {
      box().dispatchEvent(
        Object.assign(new Event("paste", { bubbles: true, cancelable: true }), {
          clipboardData: { files: [picture], getData: () => "" },
        }),
      );
    });
    expect(await screen.findByText("houseboat.png")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector("img[src^='data:image/png']")).not.toBeNull();
    });
  });

  it("takes a file dropped on the chat into the box", async () => {
    renderWithApi(
      <ChatDropZone>
        <Composer header={header(chatA)} windowOpenUntil="2099-01-01T00:00:00.000Z" />
      </ChatDropZone>,
      newQueryClient(),
    );
    const dropped = new File([new Uint8Array(10)], "itinerary.pdf", { type: "application/pdf" });
    const zone = box().closest("form")?.parentElement;
    if (!zone) throw new Error("no drop zone");
    const dragging = { types: ["Files"], files: [dropped] };
    act(() => {
      zone.dispatchEvent(
        Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), { dataTransfer: dragging }),
      );
    });
    expect(await screen.findByText("Drop the file to attach it")).toBeInTheDocument();
    act(() => {
      zone.dispatchEvent(
        Object.assign(new Event("drop", { bubbles: true, cancelable: true }), { dataTransfer: dragging }),
      );
    });
    expect(await screen.findByText("itinerary.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Drop the file to attach it")).toBeNull();
  });

  it("shows how far a file has gone, as a bubble in the chat too, and stops when cancelled", async () => {
    const api = fakeApi();
    upload.run.mockImplementation(
      (_slot: unknown, _file: unknown, options: { onProgress: (fraction: number) => void; signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.onProgress(0.4);
          options.signal.addEventListener("abort", () => {
            reject(new DOMException("stopped", "AbortError"));
          });
        }),
    );
    renderWithApi(
      <>
        <Composer header={header(chatA)} windowOpenUntil="2099-01-01T00:00:00.000Z" />
        <ul>
          <PendingBubble conversationId={chatA} />
        </ul>
      </>,
      newQueryClient(),
    );
    const input = document.querySelector<HTMLInputElement>("input[type=file]");
    if (input === null) throw new Error("the box has no file picker");
    await userEvent.upload(input, new File([new Uint8Array(10)], "plan.png", { type: "image/png" }));
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    api.calls
      .find((call) => call.path === "inbox.requestMediaUpload")
      ?.answer({
        messageId: "m1",
        attachmentId: "a1",
        upload: { url: "https://s3.example/x", method: "PUT", headers: {}, expiresAt: "2099-01-01T00:00:00.000Z" },
      });
    expect(await screen.findAllByText(/Sending 40%/)).not.toHaveLength(0);
    expect(screen.getByRole("listitem", { name: "Sending" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("listitem", { name: "Sending" })).toBeNull();
    });
    // The file stays in the box to try again, and no refusal is shown for a stop the person asked for.
    expect(screen.getByText("plan.png")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
