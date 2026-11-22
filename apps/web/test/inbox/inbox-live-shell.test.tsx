// The app's live stream on every page (inbox revamp spec, part 1 item 5): no stream while both alert switches are off and no
// Inbox page is on screen, nor for a member without the inbox; one as a switch goes on, or an Inbox page opens. Outside the
// Inbox a customer's message does two things only: the alert, and the menu's Inbox count, loaded at most once every 10 s
// (the count is loaded once as the page opens).
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepAlert } from "@/inbox/inbox-alerts";
import { COUNT_EVERY_MS, InboxLiveShell } from "@/inbox/inbox-live-shell";
import { useInboxLive } from "@/inbox/use-inbox-live";
import { useInboxSummary } from "@/inbox/use-sales-inbox";
import { MeProvider, type SignedInMember } from "@/session/me-context";
import { newQueryClient, withApp } from "../organization/api";
import { member } from "../support/members";
import { answerApi } from "./answer-api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

class FakeEventSource extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static made: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  closed = false;
  constructor() {
    super();
    FakeEventSource.made.push(this);
  }
  close() {
    this.closed = true;
    this.readyState = FakeEventSource.CLOSED;
  }
  says(data: object) {
    this.dispatchEvent(new MessageEvent("inbox", { data: JSON.stringify(data) }));
  }
}

const tones = vi.fn();
class FakeAudioContext {
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn();
  createOscillator() {
    tones();
    return { type: "", frequency: { value: 0 }, connect: (next: unknown) => next, start: vi.fn(), stop: vi.fn() };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (next: unknown) => next,
    };
  }
}

const chat = "01900000-0000-7000-8000-00000000000a";
const reader = member({ permissions: ["inbox:view", "leads:view", "leads:assign"] });

/** The menu's Inbox count, on every page. */
function Menu() {
  useInboxSummary();
  return null;
}

function InboxPage() {
  useInboxLive({ openId: null });
  return null;
}

/** Each test's query cache, emptied after it so none of its queries asks the next test's api. */
const caches: ReturnType<typeof newQueryClient>[] = [];

function theApp(me: SignedInMember, page: "elsewhere" | "inbox" = "elsewhere") {
  const queryClient = newQueryClient();
  caches.push(queryClient);
  const Providers = withApp(queryClient);
  return render(
    <Providers>
      <MeProvider me={me}>
        <InboxLiveShell />
        <Menu />
        {page === "inbox" && <InboxPage />}
      </MeProvider>
    </Providers>,
  );
}

describe("the app's live stream", () => {
  beforeEach(() => {
    window.localStorage.clear();
    tones.mockClear();
    FakeEventSource.made = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.stubGlobal("AudioContext", FakeAudioContext);
  });
  afterEach(() => {
    for (const cache of caches.splice(0)) cache.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds no stream with both switches off and no Inbox page, and one as the sound goes on", () => {
    answerApi({});
    theApp(reader);
    expect(FakeEventSource.made).toHaveLength(0);
    act(() => {
      keepAlert("sound", true);
    });
    expect(FakeEventSource.made).toHaveLength(1);
    act(() => {
      keepAlert("sound", false);
    });
    expect(FakeEventSource.made[0]?.closed).toBe(true);
  });

  it("holds one while an Inbox page is on screen, whatever the switches say", () => {
    answerApi({});
    theApp(reader, "inbox");
    expect(FakeEventSource.made).toHaveLength(1);
  });

  it("holds none for a member who can't read the inbox, the sound on or not", () => {
    answerApi({});
    window.localStorage.setItem("travel-crm.inbox.alerts.sound", "on");
    theApp(member({ permissions: ["leads:view"] }));
    expect(FakeEventSource.made).toHaveLength(0);
  });

  it("outside the Inbox, alerts and loads the menu's count, at most once every 10 s, and nothing else", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.localStorage.setItem("travel-crm.inbox.alerts.sound", "on");
    const api = answerApi({
      "inbox.conversation": { id: chat, phone: "+919876543210", name: "Meera Rao", liveLead: null, replying: [] },
      "salesInbox.summary": {},
    });
    theApp(reader);
    const wait = async (ms: number) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    };
    // The count as the page opened.
    await wait(1_000);
    const counted = () => api.of("salesInbox.summary").length;
    const opened = counted();
    const source = FakeEventSource.made[0];
    act(() => {
      for (let index = 0; index < 3; index += 1) {
        source?.says({ conversationId: chat, change: "message", direction: "in" });
        source?.says({ conversationId: chat, change: "chat" });
      }
    });
    await waitFor(() => {
      expect(tones).toHaveBeenCalled();
    });
    await wait(1_000);
    expect(counted() - opened).toBe(1);
    act(() => {
      source?.says({ conversationId: chat, change: "status" });
    });
    await wait(5_000);
    expect(counted() - opened).toBe(1);
    await wait(COUNT_EVERY_MS);
    expect(counted() - opened).toBe(2);
    // The alert read the chat's header (whose it is, its name); nothing else was asked.
    expect(new Set(api.calls.map((call) => call.path))).toEqual(new Set(["inbox.conversation", "salesInbox.summary"]));
  });
});
