// The inbox with several WhatsApp numbers (spec 2026-11-22 section 11; path 20): each chat shows its number's label and the
// list filters by number (kept in the tab), only once the agency has two; a chat's header links the customer's chat on the
// other number; the reply box follows the chat's own number (a paused one, a disconnected one with Start a chat); the send
// dialog lists that number's templates; a broadcast's number defaults to the main one; WhatsApp settings list the numbers
// and write a template on the one picked.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewBroadcastDialog } from "@/inbox/broadcasts/new-broadcast-dialog";
import { ChatPanel } from "@/inbox/chat-panel";
import { InboxScreen } from "@/inbox/inbox-screen";
import { SendTemplateDialog } from "@/inbox/send-template-dialog";
import { WhatsappSettingsScreen } from "@/inbox/whatsapp-settings-screen";
import { messages } from "@/i18n/messages";
import { readTabValue } from "@/lib/tab-storage";
import { newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { answerApi } from "./answer-api";

const navigation = vi.hoisted(() => ({ params: {} }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/inbox",
  useParams: () => navigation.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const t = messages.inbox;
const first = "01900000-0000-7000-8000-0000000000d1";
const second = "01900000-0000-7000-8000-0000000000d2";
const chatOnFirst = "01900000-0000-7000-8000-0000000000c1";
const chatOnSecond = "01900000-0000-7000-8000-0000000000c2";
const leadId = "01900000-0000-7000-8000-0000000000a1";

const aNumber = (id: string, label: string, over: Record<string, unknown> = {}) => ({
  id,
  label,
  displayNumber: id === first ? "+919876500001" : "+919876500002",
  status: "connected",
  main: id === first,
  aiAnswers: true,
  ...over,
});
const statusWith = (numbers: object[]) => ({ configured: true, connected: true, demo: false, numbers });
const twoNumbers = statusWith([aNumber(first, "Sales 1"), aNumber(second, "Sales 2")]);
const oneNumber = statusWith([aNumber(first, "Sales 1")]);

const aRow = (id: string, connectionId: string, name: string) => ({
  id,
  connectionId,
  phone: "+919812345678",
  name,
  personId: null,
  preview: "Hello",
  lastMessageAt: "2026-10-26T10:00:00.000Z",
  needsReply: false,
  isNewNumber: false,
  lastDirection: "in",
  lastStatus: null,
  lead: null,
  tags: [],
  pinned: false,
  archived: false,
  unread: 0,
  waitingSince: null,
  snoozedUntil: null,
});
const summary = {
  waiting: 0,
  late: 0,
  unread: 0,
  mine: 0,
  unassigned: 0,
  snoozed: 0,
  stages: { new: 0, contacted: 0, quote_sent: 0, booking_requested: 0, won: 0 },
};

const aHeader = (
  id: string,
  number: { id: string; label: string; status: string },
  over: Record<string, unknown> = {},
) => ({
  id,
  phone: "+919812345678",
  name: "Customer A",
  personId: null,
  lead: { id: leadId, stage: "new", ownerUserId: null, open: true },
  pastCustomer: false,
  liveLead: null,
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
  number,
  otherChats: [],
  ...over,
});

const anApprovedTemplate = (id: string, connectionId: string, name: string) => ({
  id,
  connectionId,
  name,
  language: "en",
  category: "utility",
  body: "Your trip is confirmed.",
  footer: null,
  variables: [],
  samples: [],
  status: "approved",
  reason: null,
  lastUsedAt: null,
  madeHere: true,
});
const templatesOf = (connectionId: string | null, items: object[] = []) => ({
  connectionId,
  items,
  marketingUsed: 0,
  marketingCap: 300,
  syncedAt: null,
});

const chatApi = (header: object, status: object) => ({
  "inbox.status": status,
  "inbox.conversation": header,
  "inbox.messages": { items: [], nextCursor: null, people: {}, unread: null },
  "salesInbox.notes": { items: [], people: {} },
});

beforeEach(() => {
  navigation.params = {};
  window.sessionStorage.clear();
  window.localStorage.clear();
  // Radix's Select reaches for pointer capture and scrolling, which jsdom lacks.
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const listApi = (status: object) =>
  answerApi({
    "inbox.status": status,
    "inbox.conversations": {
      items: [aRow(chatOnFirst, first, "Customer A"), aRow(chatOnSecond, second, "Customer B")],
      nextCursor: null,
    },
    "salesInbox.summary": summary,
    "inbox.tags": [],
    "leads.owners": [],
  });

describe("the inbox with several numbers", () => {
  it("shows each chat's number only when the agency has two numbers", async () => {
    screenIs("wide");
    listApi(twoNumbers);
    const view = renderWithApi(<InboxScreen>{null}</InboxScreen>, newQueryClient());
    expect(await screen.findByRole("link", { name: /Customer B/ })).toHaveTextContent("Sales 2");
    expect(screen.getByRole("link", { name: /Customer A/ })).toHaveTextContent("Sales 1");
    view.unmount();

    listApi(oneNumber);
    renderWithApi(<InboxScreen>{null}</InboxScreen>, newQueryClient());
    expect(await screen.findByRole("link", { name: /Customer A/ })).not.toHaveTextContent("Sales 1");
    expect(screen.queryByRole("combobox", { name: t.numberFilter })).toBeNull();
  });

  it("names each paused number in the banner, even two with one label", async () => {
    screenIs("wide");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    listApi(
      statusWith([aNumber(first, "WhatsApp", { status: "paused" }), aNumber(second, "WhatsApp", { status: "paused" })]),
    );
    renderWithApi(<InboxScreen>{null}</InboxScreen>, newQueryClient());
    const paused = t.numberPaused.replace("{label}", "WhatsApp");
    expect(await screen.findAllByText(paused)).toHaveLength(2);
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it("filters the chats by number, kept in the tab", async () => {
    screenIs("wide");
    const api = listApi(twoNumbers);
    const view = renderWithApi(<InboxScreen>{null}</InboxScreen>, newQueryClient());
    await userEvent.click(await screen.findByRole("combobox", { name: t.numberFilter }));
    await userEvent.click(await screen.findByRole("option", { name: "Sales 2" }));
    await waitFor(() => {
      expect(api.of("inbox.conversations").at(-1)?.input).toMatchObject({ connectionId: second });
    });
    expect(readTabValue("inbox.number")).toBe(second);
    view.unmount();

    const again = listApi(twoNumbers);
    renderWithApi(<InboxScreen>{null}</InboxScreen>, newQueryClient());
    await screen.findByRole("link", { name: /Customer B/ });
    expect(again.of("inbox.conversations").at(-1)?.input).toMatchObject({ connectionId: second });
  });

  it("links the customer's chat on the other number from the header", async () => {
    screenIs("wide");
    answerApi(
      chatApi(
        aHeader(
          chatOnFirst,
          { id: first, label: "Sales 1", status: "connected" },
          { otherChats: [{ id: chatOnSecond, label: "Sales 2", status: "connected" }] },
        ),
        twoNumbers,
      ),
    );
    renderWithApi(<ChatPanel conversationId={chatOnFirst} variant="page" />, newQueryClient());
    const link = await screen.findByRole("link", { name: "Also on Sales 2" });
    expect(link).toHaveAttribute("href", `/inbox/${chatOnSecond}`);
  });

  it("says a disconnected number's chat can't be answered, and offers a chat from the main number", async () => {
    screenIs("wide");
    const api = answerApi({
      ...chatApi(
        aHeader(chatOnSecond, { id: second, label: "Sales 2", status: "disconnected" }),
        statusWith([aNumber(first, "Sales 1"), aNumber(second, "Sales 2", { status: "disconnected" })]),
      ),
      "inbox.startChat": { conversationId: chatOnFirst },
      "whatsappTemplates.sendable": templatesOf(first),
    });
    renderWithApi(<ChatPanel conversationId={chatOnSecond} variant="page" />, newQueryClient());
    expect(await screen.findByText(messages.errors.reasons.WHATSAPP_NUMBER_DISCONNECTED)).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Message" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: t.leadSection.startWithTemplate }));
    await waitFor(() => {
      expect(api.of("inbox.startChat").map((call) => call.input)).toEqual([{ leadId }]);
    });
  });

  it("keeps replies open in one number's chats while the other number is paused", async () => {
    screenIs("wide");
    const status = statusWith([aNumber(first, "Sales 1"), aNumber(second, "Sales 2", { status: "paused" })]);
    answerApi(chatApi(aHeader(chatOnFirst, { id: first, label: "Sales 1", status: "connected" }), status));
    const view = renderWithApi(<ChatPanel conversationId={chatOnFirst} variant="page" />, newQueryClient());
    expect(await screen.findByRole("combobox", { name: "Message" })).toBeVisible();
    view.unmount();

    answerApi(chatApi(aHeader(chatOnSecond, { id: second, label: "Sales 2", status: "paused" }), status));
    renderWithApi(<ChatPanel conversationId={chatOnSecond} variant="page" />, newQueryClient());
    expect(await screen.findByText(t.chat.replyNumberPaused.replace("{label}", "Sales 2"))).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Message" })).toBeNull();
  });

  it("lists the chat's own number's templates in the send dialog", async () => {
    screenIs("wide");
    const api = answerApi({
      ...chatApi(aHeader(chatOnSecond, { id: second, label: "Sales 2", status: "connected" }), twoNumbers),
      "whatsappTemplates.sendable": templatesOf(second, [anApprovedTemplate(chatOnFirst, second, "trip_update")]),
    });
    renderWithApi(
      <SendTemplateDialog conversationId={chatOnSecond} open onOpenChange={() => undefined} />,
      newQueryClient(),
    );
    expect(await screen.findByText("trip_update")).toBeInTheDocument();
    expect(api.of("whatsappTemplates.sendable").map((call) => call.input)).toEqual([{ conversationId: chatOnSecond }]);
  });

  it("picks a broadcast's number, the main one first, and lists its templates", async () => {
    screenIs("wide");
    const api = answerApi({
      "inbox.status": twoNumbers,
      "inbox.tags": [{ id: leadId, name: "Kedarnath" }],
      "whatsappTemplates.list": (input: unknown) => {
        const connectionId = (input as { connectionId?: string } | undefined)?.connectionId ?? first;
        return templatesOf(connectionId, [
          anApprovedTemplate(
            connectionId === first ? chatOnFirst : chatOnSecond,
            connectionId,
            `offer_${connectionId.slice(-2)}`,
          ),
        ]);
      },
      "broadcasts.preview": {
        willSend: 3,
        leftOut: { optedOut: 0, noConsent: 0, outsideVisibility: 0, overAllowance: 0, otherNumber: 2 },
        allowance: null,
        today: { sendToday: 3, waitForTomorrow: 0 },
      },
    });
    renderWithApi(
      <NewBroadcastDialog open onOpenChange={() => undefined} returnFocusTo={{ current: null }} />,
      newQueryClient(),
    );
    const number = await screen.findByRole("combobox", { name: t.broadcasts.dialog.number });
    expect(number).toHaveTextContent("Sales 1");
    await waitFor(() => {
      expect(api.of("whatsappTemplates.list").map((call) => call.input)).toContainEqual({ connectionId: first });
    });
    await userEvent.click(number);
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["Sales 1", "Sales 2"]);
    await userEvent.click(screen.getByRole("option", { name: "Sales 2" }));
    await waitFor(() => {
      expect(api.of("whatsappTemplates.list").map((call) => call.input)).toContainEqual({ connectionId: second });
    });
    await userEvent.click(screen.getByRole("combobox", { name: t.broadcasts.dialog.template }));
    await userEvent.click(await screen.findByRole("option", { name: "offer_d2" }));
    await userEvent.click(screen.getByRole("button", { name: "Kedarnath" }));
    await userEvent.click(screen.getByRole("button", { name: t.broadcasts.dialog.check }));
    expect(await screen.findByText(/2 are chats on another number/)).toBeVisible();
  });

  it("lists the numbers in WhatsApp settings and writes a template on the picked number", async () => {
    screenIs("wide");
    const api = answerApi({
      "inbox.status": twoNumbers,
      "whatsappTemplates.list": (input: unknown) =>
        templatesOf((input as { connectionId?: string } | undefined)?.connectionId ?? first),
      "whatsappTemplates.create": { templateId: chatOnFirst },
      "inbox.quickReplies": [],
      "inbox.tags": [],
      "tripKits.list": [],
    });
    renderWithApi(<WhatsappSettingsScreen />, newQueryClient());
    const numbers = await screen.findByRole("table", { name: t.settings.numbers });
    const rows = within(numbers).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Sales 1"),
      expect.stringContaining("Sales 2"),
    ]);
    expect(rows[0]).toHaveTextContent(t.settings.main);
    expect(rows[1]).not.toHaveTextContent(t.settings.main);

    await userEvent.click(screen.getByRole("combobox", { name: t.templates.number }));
    await userEvent.click(await screen.findByRole("option", { name: "Sales 2" }));
    await waitFor(() => {
      expect(api.of("whatsappTemplates.list").map((call) => call.input)).toContainEqual({ connectionId: second });
    });
    await userEvent.click(screen.getByRole("button", { name: t.templates.form.new }));
    const dialog = await screen.findByRole("dialog", { name: t.templates.form.newTitle });
    await userEvent.type(within(dialog).getByLabelText(t.templates.form.name), "trip_update");
    await userEvent.type(within(dialog).getByLabelText(t.templates.form.body), "Your trip is confirmed.");
    await userEvent.click(within(dialog).getByRole("button", { name: t.templates.form.submit }));
    await waitFor(() => {
      expect(api.of("whatsappTemplates.create").map((call) => call.input)).toEqual([
        expect.objectContaining({ connectionId: second }),
      ]);
    });
  });
});
