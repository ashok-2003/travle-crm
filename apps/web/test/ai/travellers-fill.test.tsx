// "Fill with AI" on a booking's travellers: offered only to those who may edit the booking with the AI on; the proposal puts each
// person beside the row they fill (changeable, or not saved), ticks what a row holds nothing for, shows what it holds otherwise,
// says an age alone still needs a date of birth, and Save sends only the ticked fields of the people with a row, carrying the fill.
import type { AiFillProposal, FillTraveller } from "@travel-crm/contracts/ai";
import type { BookingDetail } from "@travel-crm/contracts/bookings";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FillTravellersWithAi } from "@/ai/travellers/fill-travellers-with-ai";
import { newQueryClient, paidSubscription, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { stubApi } from "../support/api-stub";
import { member } from "../support/members";

const ROW_1 = "0199a000-0000-7000-8000-0000000000a1";
const ROW_2 = "0199a000-0000-7000-8000-0000000000a2";
const ROW_3 = "0199a000-0000-7000-8000-0000000000a3";

const row = (id: string, position: number, name: string) => ({
  id,
  position,
  name,
  dateOfBirth: null,
  gender: null,
  phone: "",
  emergencyName: "",
  emergencyPhone: "",
  medicalNotes: "",
  roomRequest: "none",
  roomNote: "",
  complete: false,
  hasIdentity: false,
});
const booking = {
  id: "0199a000-0000-7000-8000-0000000000b1",
  status: "confirmed",
  level: "international",
  travellers: [row(ROW_1, 0, ""), row(ROW_2, 1, "Sunita Old"), row(ROW_3, 2, "")],
} as unknown as BookingDetail;

const people: FillTraveller[] = [
  {
    saidName: "Ramesh Sharma",
    travellerId: ROW_1,
    name: "Ramesh Sharma",
    dateOfBirth: "1980-06-12",
    identity: {
      kind: "passport",
      number: "Z1234567",
      issuedOn: "2025-01-02",
      expiresOn: "2035-01-01",
      nationality: "IND",
    },
  },
  {
    saidName: "Sunita",
    travellerId: ROW_2,
    name: "Sunita Sharma",
    roomRequest: "ground_floor",
    roomNote: "ground floor",
  },
  { saidName: "Aarav", travellerId: ROW_3, name: "Aarav", ageOnly: 12 },
  { saidName: "Meera", travellerId: null, name: "Meera" },
];
const proposal: AiFillProposal = {
  fillId: "0199a000-0000-7000-8000-0000000000f3",
  fields: [{ path: "travellers", value: JSON.parse(JSON.stringify(people)) as never, from: "voice", excerpt: "" }],
  questions: ["There are 3 rows; 4 people were named"],
  truncated: false,
  removedAmounts: false,
  usedThisMonth: 1,
  monthlyLimit: 3000,
};

function render(permissions = ["ai:suggest", "bookings:edit", "documents:view_sensitive"]) {
  screenIs("wide");
  // Radix selects ask for pointer capture, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  stubApi({
    "ai.status": { data: { enabled: true } },
    "ai.fill.travellers": { data: proposal },
    "bookings.saveTravellers": { data: null },
  });
  const queryClient = newQueryClient({ ...paidSubscription, modules: ["crm", "ai", "bookings"] as never });
  renderWithApi(<FillTravellersWithAi booking={booking} />, queryClient, member({ permissions }));
}

function sentTo(path: string): unknown {
  for (const [input, init] of vi.mocked(fetch).mock.calls) {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes(path) && typeof init?.body === "string") return JSON.parse(init.body);
  }
  return undefined;
}

describe("Fill with AI on the travellers", () => {
  it("is not offered without the AI permission", async () => {
    render(["bookings:edit"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: "Fill with AI" })).toBeNull();
  });

  it("shows each person beside a row, ticks what is empty, says an age is not a birthday, and saves only what is ticked", async () => {
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Fill with AI" }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByLabelText("Who is travelling"), "Ramesh, wife Sunita, son Aarav");
    await user.click(within(sheet).getByRole("button", { name: "Read the travellers" }));

    expect(await within(sheet).findByText("There are 3 rows; 4 people were named")).toBeInTheDocument();
    // The age alone is said as such, and no date of birth is offered for Aarav.
    expect(
      within(sheet).getByText(/Only an age was said \(12\): the date of birth is still needed\./),
    ).toBeInTheDocument();
    expect(within(sheet).getByText(/No row fits\. There are 3 rows/)).toBeInTheDocument();
    // The passport is shown to be checked, number and all.
    expect(within(sheet).getByText(/Z1234567, issued 2 Jan 2025, expires 1 Jan 2035, IND/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Read from the passport's printed code lines/)).toBeInTheDocument();

    // Row 2 already holds "Sunita Old": the name is unticked and shows it; the room request (empty there) is ticked.
    const names = within(sheet).getAllByRole("checkbox", { name: /Name/ });
    expect(names[0]).toBeChecked();
    expect(names[1]).not.toBeChecked();
    expect(within(sheet).getByText("Now: Sunita Old.")).toBeInTheDocument();
    expect(within(sheet).getByRole("checkbox", { name: /^Room\s*A ground-floor room/ })).toBeChecked();

    // Nothing was saved by reading.
    expect(sentTo("bookings.saveTravellers")).toBeUndefined();
    await user.click(within(sheet).getByRole("button", { name: "Save 3 travellers" }));
    await waitFor(() => {
      expect(sentTo("bookings.saveTravellers")).toBeDefined();
    });
    const sent = sentTo("bookings.saveTravellers") as Record<
      string,
      { travellers: Record<string, unknown>[]; aiFill: unknown }
    >;
    const body = sent["0"];
    expect(body?.aiFill).toEqual({ fillId: proposal.fillId, paths: ["travellers"] });
    expect(body?.travellers).toEqual([
      {
        travellerId: ROW_1,
        name: "Ramesh Sharma",
        dateOfBirth: "1980-06-12",
        identity: {
          kind: "passport",
          number: "Z1234567",
          issuedOn: "2025-01-02",
          expiresOn: "2035-01-01",
          nationality: "IND",
        },
      },
      { travellerId: ROW_2, roomRequest: "ground_floor", roomNote: "ground floor" },
      { travellerId: ROW_3, name: "Aarav" },
    ]);
  });

  it("holds Save while two people share a row, and a photo is offered only to those who may read IDs", async () => {
    const user = userEvent.setup();
    render(["ai:suggest", "bookings:edit"]);
    await user.click(await screen.findByRole("button", { name: "Fill with AI" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByRole("button", { name: "Add a photo of a list or an ID" })).toBeNull();
    expect(within(sheet).getByText(/Photos of IDs need permission to see ID numbers/)).toBeInTheDocument();
    await user.type(within(sheet).getByLabelText("Who is travelling"), "x");
    await user.click(within(sheet).getByRole("button", { name: "Read the travellers" }));
    await within(sheet).findByText(/Only an age was said/);
    await user.click(within(sheet).getByRole("combobox", { name: "Row for Aarav" }));
    await user.click(await screen.findByRole("option", { name: "Traveller 1" }));
    expect(within(sheet).getByText(/Two people are on the same row/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: /^Save/ })).toBeDisabled();
  });
});
