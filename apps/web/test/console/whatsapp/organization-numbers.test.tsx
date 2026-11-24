// An organization's WhatsApp numbers on its console page (spec 2026-11-22 section 10): each live number in a region of its
// own with its label, status, the Main mark and its own actions, which send that number's id; Connect a number while the
// plan has room, with "1 of 2 numbers"; Disconnect asked once more, naming the number that becomes main; Rename and Make
// main.
import type { ConsoleNumber, ConsoleOrganizationWhatsapp } from "@travel-crm/contracts/inbox";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrganizationWhatsapp } from "@/console/whatsapp/organization-whatsapp";
import { messages } from "@/i18n/messages";
import { screenIs } from "../../organization/render";
import { stubApi } from "../../support/api-stub";
import { inputsTo, renderConsole } from "../../support/render-console";

const text = messages.consoleWhatsapp;
const organizationId = "0199a000-0000-7000-8000-0000000000a1";
const first = "0199a000-0000-7000-8000-0000000000d1";
const second = "0199a000-0000-7000-8000-0000000000d2";
const third = "0199a000-0000-7000-8000-0000000000d3";
const displayNumbers: Record<string, string> = {
  [first]: "+919876543210",
  [second]: "+919812345678",
  [third]: "+919811122233",
};

beforeEach(() => {
  screenIs("wide");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function aNumber(id: string, label: string, overrides: Partial<ConsoleNumber> = {}): ConsoleNumber {
  return {
    id,
    organizationId,
    organizationName: "Test agency",
    label,
    main: false,
    displayNumber: displayNumbers[id] ?? "+919800000000",
    mode: "new_number",
    status: "connected",
    connectedAt: "2026-11-20T04:30:00.000Z",
    lastEventAt: "2026-11-22T04:30:00.000Z",
    webhookSeenAt: "2026-11-20T04:30:00.000Z",
    messagesThisMonth: { inbound: 0, outbound: 0, marketing: 0 },
    marketingCapMonth: 300,
    templateCapDay: 100,
    overFairUse: false,
    cancelledButConnected: false,
    problemSince: null,
    qualityRating: null,
    note: null,
    usage: [],
    cannotConnectReason: null,
    ...overrides,
  };
}

function aGroup(
  numbers: ConsoleNumber[],
  overrides: Partial<ConsoleOrganizationWhatsapp> = {},
): ConsoleOrganizationWhatsapp {
  return {
    configured: true,
    numbers,
    limit: { used: numbers.length, allowed: 2 },
    cannotAddReason: numbers.length >= 2 ? "LIMIT_REACHED" : null,
    ...overrides,
  };
}

const twoNumbers = (secondOverrides: Partial<ConsoleNumber> = {}) =>
  aGroup([aNumber(first, "Sales 1", { main: true }), aNumber(second, "Sales 2", secondOverrides)]);

const render = (group: ConsoleOrganizationWhatsapp, answers: Record<string, { data: unknown }> = {}) => {
  stubApi({ "platform.whatsapp.get": { data: group }, ...answers });
  return renderConsole(<OrganizationWhatsapp organizationId={organizationId} />);
};

/** A number's region, named by its label and number. */
const numberRegion = (label: string) => screen.findByRole("region", { name: new RegExp(`^${label} \\(\\+91`) });

describe("an organization's WhatsApp numbers", () => {
  it("lists each number with its label, status and main mark, and its own actions", async () => {
    render(twoNumbers({ status: "setup", connectedAt: null }));
    const main = await numberRegion("Sales 1");
    expect(within(main).getByText(text.group.main)).toBeVisible();
    expect(within(main).getByText(text.status.connected)).toBeVisible();
    expect(within(main).getByRole("button", { name: text.group.pause })).toBeVisible();
    expect(within(main).queryByRole("button", { name: text.group.makeMain })).toBeNull();

    const other = await numberRegion("Sales 2");
    expect(within(other).queryByText(text.group.main)).toBeNull();
    expect(within(other).getByText(text.status.setup)).toBeVisible();
    expect(within(other).getByRole("button", { name: text.group.markConnected })).toBeEnabled();
    // Still being set up: it can be made main once it is connected.
    expect(within(other).getByRole("button", { name: text.group.makeMain })).toBeDisabled();
    expect(within(other).getByText(text.group.makeMainAfterSetup)).toBeVisible();
    expect(within(other).queryByRole("button", { name: text.group.pause })).toBeNull();
  });

  it("acts on the number whose button was pressed", async () => {
    render(twoNumbers(), {
      "platform.whatsapp.pause": { data: null },
      "platform.whatsapp.checkWithProvider": { data: { answered: true } },
    });
    await userEvent.click(within(await numberRegion("Sales 2")).getByRole("button", { name: text.group.pause }));
    await waitFor(() => {
      expect(inputsTo("whatsapp.pause")).toEqual([{ organizationId, connectionId: second }]);
    });
    await userEvent.click(within(await numberRegion("Sales 1")).getByRole("button", { name: text.group.check }));
    await waitFor(() => {
      expect(inputsTo("whatsapp.checkWithProvider")).toEqual([{ organizationId, connectionId: first }]);
    });
  });

  it("offers Connect a number while the plan has room, and says 2 of 2 when it has none", async () => {
    const { unmount } = render(aGroup([aNumber(first, "Sales 1", { main: true })]));
    expect(await screen.findByText("1 of 2 numbers")).toBeVisible();
    expect(screen.getByRole("button", { name: text.group.connect })).toBeVisible();
    unmount();

    render(twoNumbers());
    expect(await screen.findByText(/^2 of 2 numbers/)).toHaveTextContent(text.group.cannotAdd.LIMIT_REACHED);
    expect(screen.queryByRole("button", { name: text.group.connect })).toBeNull();
  });

  it("asks before disconnecting the main number, naming the number that becomes main", async () => {
    render(twoNumbers(), { "platform.whatsapp.disconnect": { data: null } });
    await userEvent.click(within(await numberRegion("Sales 1")).getByRole("button", { name: text.group.disconnect }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Disconnect Sales 1?");
    expect(dialog).toHaveTextContent("Sales 2 (+91 98123 45678) becomes the main number.");
    await userEvent.click(within(dialog).getByRole("button", { name: text.disconnectConfirm.confirm }));
    await waitFor(() => {
      expect(inputsTo("whatsapp.disconnect")).toEqual([{ organizationId, connectionId: first }]);
    });
  });

  it("names two numbers with one label apart by their numbers", async () => {
    render(aGroup([aNumber(first, "Sales 1", { main: true }), aNumber(second, "Sales 1")]));
    expect(await screen.findByRole("region", { name: "Sales 1 (+91 98765 43210)" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Sales 1 (+91 98123 45678)" })).toBeVisible();
  });

  it("names as the next main the oldest number past setting up, not an older one still setting up", async () => {
    render(
      aGroup(
        [
          aNumber(first, "Sales 1", { main: true }),
          aNumber(second, "Sales 2", { status: "setup", connectedAt: null }),
          aNumber(third, "Sales 3"),
        ],
        { limit: { used: 3, allowed: 3 } },
      ),
    );
    await userEvent.click(within(await numberRegion("Sales 1")).getByRole("button", { name: text.group.disconnect }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Sales 3 (+91 98111 22233) becomes the main number.",
    );
  });

  it("renames a number and makes another main", async () => {
    render(twoNumbers(), {
      "platform.whatsapp.rename": { data: null },
      "platform.whatsapp.setMain": { data: null },
    });
    const other = await numberRegion("Sales 2");
    await userEvent.click(within(other).getByRole("button", { name: text.group.rename }));
    const dialog = await screen.findByRole("dialog", { name: "Rename Sales 2" });
    const label = within(dialog).getByLabelText(text.rename.label);
    expect(label).toHaveValue("Sales 2");
    await userEvent.clear(label);
    await userEvent.type(label, "Sales 3");
    await userEvent.click(within(dialog).getByRole("button", { name: text.rename.submit }));
    await waitFor(() => {
      expect(inputsTo("whatsapp.rename")).toEqual([{ organizationId, connectionId: second, label: "Sales 3" }]);
    });

    await userEvent.click(within(other).getByRole("button", { name: text.group.makeMain }));
    await waitFor(() => {
      expect(inputsTo("whatsapp.setMain")).toEqual([{ organizationId, connectionId: second }]);
    });
  });
});
