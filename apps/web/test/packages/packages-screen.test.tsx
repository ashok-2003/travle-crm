// /packages: a table on a wide screen and a row each on a phone, with each trip's From price, next departure and seats
// and the badges for what needs attention; New package names a package of either kind and opens its page.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import userEvent from "@testing-library/user-event";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackagesScreen } from "@/packages/packages-screen";
import { messages } from "@/i18n/messages";
import { formatCalendarDay } from "@/lib/format";
import { member } from "../support/members";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const listed = (overrides: Partial<QuotePackage>): QuotePackage => ({
  id: "0192f3a0-0000-7000-8000-000000000001",
  name: "Manali Escape",
  title: "Manali Escape",
  days: 0,
  subtotalPaise: 0,
  taxRateBasisPoints: 500,
  published: false,
  slug: null,
  tierCount: 0,
  kind: "group",
  nights: 5,
  fromPricePaise: null,
  aiSellable: false,
  aiSells: false,
  aiGap: null,
  departuresAhead: 0,
  nextDeparture: null,
  ...overrides,
});

async function showing(packages: QuotePackage[]) {
  const api = fakeApi();
  renderWithApi(<PackagesScreen />, newQueryClient());
  await waitFor(() => {
    expect(api.calls.some((call) => call.path === "quotes.packages")).toBe(true);
  });
  api.calls.find((call) => call.path === "quotes.packages")?.answer(packages);
  return api;
}

describe("PackagesScreen", () => {
  beforeEach(() => {
    screenIs("wide");
    push.mockClear();
  });

  const manali = (overrides: Partial<QuotePackage> = {}) =>
    listed({
      name: "Manali 2N/3D",
      nights: 2,
      fromPricePaise: 500_000,
      aiSellable: true,
      aiSells: true,
      departuresAhead: 24,
      nextDeparture: { startDate: "2026-11-27", seatsFree: 20 },
      ...overrides,
    });
  const day = formatCalendarDay("2026-11-27");
  // A line whose words sit in several spans (only the numbers have the number font): matched on its whole text.
  const line = (text: string) => (_content: string, element: Element | null) =>
    element !== null &&
    element.textContent === text &&
    [...element.children].every((child) => child.textContent !== text);

  it("shows a table of each trip's price, next departure and departures on a wide screen", async () => {
    await showing([manali()]);
    expect(await screen.findByText("Manali 2N/3D")).toBeTruthy();
    for (const header of ["Trip", "From", "Next departure", "Departures", "Status"])
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    expect(screen.getByText("Group trip · 2 nights")).toBeTruthy();
    expect(screen.getByText("₹5,000")).toBeTruthy();
    expect(screen.getByText(line(`${day} · 20 left`))).toBeTruthy();
    expect(screen.getByText("24")).toBeTruthy();
    expect(screen.queryByText(messages.packages.list.aiOff)).toBeNull();
    expect(screen.queryByText(messages.packages.list.noDeparturesAhead)).toBeNull();
    expect(screen.queryByText(/published/i)).toBeNull();
  });

  it("shows the next departure on one line on a phone", async () => {
    screenIs("phone");
    await showing([manali()]);
    expect(await screen.findByText("Manali 2N/3D")).toBeTruthy();
    expect(screen.getByText(line(`From ₹5,000 · ${day} · 20 left`))).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("puts a few seats left in bold, and says Full at none", async () => {
    await showing([
      manali({ nextDeparture: { startDate: "2026-11-27", seatsFree: 3 } }),
      manali({
        id: "0192f3a0-0000-7000-8000-000000000002",
        name: "Kashmir",
        nextDeparture: { startDate: "2026-11-27", seatsFree: 0 },
      }),
    ]);
    // The count alone has the number font; the bold wraps the words around it.
    const few = await screen.findByText("3");
    expect(few.className).toContain("numbers");
    expect(few.parentElement?.tagName).toBe("STRONG");
    expect(few.parentElement?.textContent).toBe("3 left");
    expect(screen.getByText(line(`${day} · Full`))).toBeTruthy();
  });

  it("badges only what needs attention", async () => {
    await showing([
      manali(),
      manali({ id: "0192f3a0-0000-7000-8000-000000000002", name: "Off", aiSellable: false, aiSells: false }),
      manali({
        id: "0192f3a0-0000-7000-8000-000000000003",
        name: "Gap",
        aiSells: false,
        aiGap: "departures",
      }),
      manali({
        id: "0192f3a0-0000-7000-8000-000000000004",
        name: "Empty",
        departuresAhead: 0,
        nextDeparture: null,
      }),
    ]);
    expect(await screen.findByText("Gap")).toBeTruthy();
    expect(screen.getAllByText(messages.packages.list.aiOff)).toHaveLength(1);
    expect(
      screen.getAllByText(
        messages.packages.list.aiBlocked.replace("{reason}", messages.packages.sell.reasons.departures),
      ),
    ).toHaveLength(1);
    expect(screen.getAllByText(messages.packages.list.noDeparturesAhead)).toHaveLength(1);
  });

  it("deletes from the row's menu, after the confirmation", async () => {
    const api = await showing([manali()]);
    await userEvent.click(await screen.findByRole("button", { name: "More for Manali 2N/3D" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: messages.packages.list.delete }));
    expect(await screen.findByText("Delete Manali 2N/3D?")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: messages.packages.list.delete }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "quotes.deletePackage")).toBe(true);
    });
    expect(api.calls.find((call) => call.path === "quotes.deletePackage")?.input).toEqual({
      packageId: "0192f3a0-0000-7000-8000-000000000001",
    });
  });

  it("has no menu for a member who may not edit", async () => {
    const api = fakeApi();
    renderWithApi(<PackagesScreen />, newQueryClient(), member({ permissions: ["quotes:view"] }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "quotes.packages")).toBe(true);
    });
    api.calls.find((call) => call.path === "quotes.packages")?.answer([manali()]);
    expect(await screen.findByText("Manali 2N/3D")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull();
  });

  it("still shows the From price and the departures count when an older api sends no next departure", async () => {
    const older: Record<string, unknown> = { ...manali() };
    delete older.nextDeparture;
    screenIs("phone");
    await showing([older as QuotePackage]);
    expect(await screen.findByText(line("From ₹5,000 · 24 departures ahead"))).toBeTruthy();
  });

  it("keeps a custom trip's words and From price on a phone, and puts the number font only on numbers", async () => {
    screenIs("phone");
    await showing([
      listed({ name: "Kashmir Classic", kind: "custom", nights: 6, fromPricePaise: 1_800_000 }),
      manali(),
    ]);
    expect(await screen.findByText(line("Custom trip · 6 nights · From ₹18,000"))).toBeTruthy();
    expect(screen.getByText("₹18,000").className).toContain("numbers");
    const group = screen.getByText(line(`From ₹5,000 · ${day} · 20 left`));
    expect(group.className).not.toContain("numbers");
  });

  it("keeps a custom trip's words", async () => {
    await showing([listed({ name: "Kashmir Classic", kind: "custom", nights: 6, fromPricePaise: 1_800_000 })]);
    expect(await screen.findByText("Custom trip · 6 nights")).toBeTruthy();
    expect(screen.getByText("₹18,000")).toBeTruthy();
  });

  it("asks for a name and a kind, then opens the new package's page", async () => {
    const api = await showing([]);
    expect(await screen.findByText(messages.packages.list.none)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: messages.packages.create.new }));
    fireEvent.change(await screen.findByRole("textbox", { name: messages.packages.create.name }), {
      target: { value: "Spiti Winter" },
    });
    fireEvent.click(screen.getByRole("radio", { name: messages.packages.form.kinds.custom }));
    fireEvent.click(screen.getByRole("button", { name: messages.packages.create.create }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "quotes.createPackage")).toBe(true);
    });
    const create = api.calls.find((call) => call.path === "quotes.createPackage");
    expect(create?.input).toEqual({ name: "Spiti Winter", kind: "custom" });
    create?.answer({ id: "0192f3a0-0000-7000-8000-000000000003" });
    // The list loads again with the new package before its page opens.
    await waitFor(() => {
      expect(api.calls.filter((call) => call.path === "quotes.packages")).toHaveLength(2);
    });
    api.calls.filter((call) => call.path === "quotes.packages")[1]?.answer([listed({ name: "Spiti Winter" })]);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/packages/0192f3a0-0000-7000-8000-000000000003");
    });
  });
});
