// Blocked contacts in Settings (spec 3.6, R33): the phones, emails and Instagram handles blocked from leads, newest
// first and a page at a time, each as people read it (+91 98765 43210, @handle), with who blocked it and when in the
// agency's zone; Unblock asks first, then takes it off the list. Needs leads:assign; the way back is to Settings for
// those who manage it, and to Leads, where they came in, for those who don't.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockedContactsScreen } from "@/crm-settings/blocked-contacts-screen";
import { Toaster } from "@/components/ui/sonner";
import { messages } from "@/i18n/messages";
import { inputsSentTo } from "../documents/sent";
import { renderAs, screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const words = messages.settings.blockedContacts;
const asha = "0199a000-0000-7000-8000-000000000001";

const phone = {
  id: "0199e7a0-0000-7000-8000-0000000000b3",
  kind: "phone",
  value: "+919876543210",
  blockedBy: asha,
  blockedAt: "2026-10-16T05:00:00.000Z",
};
const email = {
  id: "0199e7a0-0000-7000-8000-0000000000b2",
  kind: "email",
  value: "spam@example.com",
  blockedBy: "0199a000-0000-7000-8000-0000000000c9",
  blockedAt: "2026-10-12T05:00:00.000Z",
};
const handle = {
  id: "0199e7a0-0000-7000-8000-0000000000b1",
  kind: "instagram",
  value: "cheap.tours.offers",
  blockedBy: asha,
  blockedAt: "2026-09-30T20:00:00.000Z",
};

const page = (items: unknown[], nextCursor: string | null = null) => ({
  data: { items, nextCursor, people: { [asha]: "Asha" } },
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T06:30:00Z"));
  screenIs("wide");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderScreen(me = member({ isOwner: true })) {
  return renderAs(
    <>
      <BlockedContactsScreen />
      <Toaster />
    </>,
    me,
  );
}

/** Each blocked contact as listed: its text. */
async function listed(): Promise<string[]> {
  const list = await screen.findByRole("list", { name: words.listLabel });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("BlockedContactsScreen", () => {
  it("lists blocked contacts newest first, formatted, with who blocked them and when, and unblocks after asking", async () => {
    const api = stubApi({
      "blockedContacts.list": page([phone, email, handle]),
      "blockedContacts.unblock": { data: null },
    });
    renderScreen();
    expect(await listed()).toEqual([
      expect.stringMatching(/^\+91 98765 43210Phone.*Blocked by Asha, 16 Oct/),
      // Blocked by someone no longer a member.
      expect.stringMatching(/^spam@example\.comEmail.*Blocked by A former member, 12 Oct/),
      // 20:00 UTC on 30 September is 1 October in India.
      expect.stringMatching(/^@cheap\.tours\.offersInstagram.*Blocked by Asha, 1 Oct/),
    ]);
    expect(inputsSentTo("blockedContacts.list")).toEqual([{}]);

    await userEvent.click(screen.getByRole("button", { name: "Unblock +91 98765 43210" }));
    const asking = await screen.findByRole("alertdialog", { name: "Unblock +91 98765 43210?" });
    expect(inputsSentTo("blockedContacts.unblock")).toEqual([]);
    api.answer("blockedContacts.list", page([email, handle]));
    await userEvent.click(within(asking).getByRole("button", { name: words.unblock.action }));
    await waitFor(() => {
      expect(inputsSentTo("blockedContacts.unblock")).toEqual([{ blockedContactId: phone.id }]);
    });
    expect(await screen.findByText(words.unblock.done)).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    await waitFor(async () => {
      expect(await listed()).toHaveLength(2);
    });
  });

  it("shows the next page with Show more", async () => {
    const api = stubApi({ "blockedContacts.list": page([phone, email], email.id) });
    renderScreen();
    expect(await listed()).toHaveLength(2);
    api.answer("blockedContacts.list", page([handle]));
    await userEvent.click(screen.getByRole("button", { name: words.more }));
    await waitFor(async () => {
      expect(await listed()).toHaveLength(3);
    });
    expect(inputsSentTo("blockedContacts.list").at(-1)).toEqual({ before: email.id });
  });

  it("leads back to Settings for those who manage it, and to Leads for those who only assign leads", async () => {
    stubApi({ "blockedContacts.list": page([]) });
    const owner = renderScreen();
    expect(await screen.findByRole("link", { name: messages.settings.title })).toHaveAttribute("href", "/settings");
    owner.unmount();

    renderScreen(member({ permissions: ["leads:view", "leads:assign"] }));
    expect(await screen.findByRole("link", { name: messages.leads.lead.back })).toHaveAttribute("href", "/leads");
    expect(screen.queryByRole("link", { name: messages.settings.title })).not.toBeInTheDocument();
  });

  it("says when nothing is blocked, and when the list didn't load, with Try again", async () => {
    const api = stubApi({ "blockedContacts.list": page([]) });
    const first = renderScreen();
    expect(await screen.findByText(words.empty)).toBeVisible();
    first.unmount();

    api.answer("blockedContacts.list", { status: 500 });
    renderScreen();
    expect(await screen.findByText(words.loadFailed)).toBeVisible();
    api.answer("blockedContacts.list", page([phone]));
    await userEvent.click(screen.getByRole("button", { name: messages.common.tryAgain }));
    expect(await listed()).toHaveLength(1);
  });
});
