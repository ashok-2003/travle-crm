// /packages: each package says what it is (a group trip and its departures ahead, a custom trip and its From price),
// marks the ones the AI sells, and New package names a package of either kind and opens its page.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackagesScreen } from "@/packages/packages-screen";
import { messages } from "@/i18n/messages";
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
  departuresAhead: 0,
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

  it("says what each package is, and which ones the AI sells", async () => {
    await showing([
      listed({ aiSellable: true, departuresAhead: 3 }),
      listed({
        id: "0192f3a0-0000-7000-8000-000000000002",
        name: "Kashmir Classic",
        kind: "custom",
        nights: 6,
        fromPricePaise: 1_800_000,
      }),
    ]);
    expect(await screen.findByText("Group trip · 5 nights · 3 departures ahead")).toBeTruthy();
    expect(screen.getByText("Custom trip · 6 nights · From ₹18,000")).toBeTruthy();
    expect(screen.getAllByText(messages.packages.list.aiSells)).toHaveLength(1);
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
