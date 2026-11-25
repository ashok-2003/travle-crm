// A group package's files, and the room prices on a linked departure's form.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DepartureFormDialog } from "@/departures/departure-form-dialog";
import { PackageFilesCard } from "@/packages/package-files-card";
import { messages } from "@/i18n/messages";
import { renderScreen } from "../leads/screen";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { stubApi } from "../support/api-stub";
import { screenIs } from "../organization/render";
import { aPackage } from "./detail";

const packageId = aPackage().id;
const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

beforeEach(() => {
  screenIs("wide");
});

describe("PackageFilesCard", () => {
  it("lists the brochures", async () => {
    const api = fakeApi();
    renderWithApi(<PackageFilesCard packageId={packageId} />, newQueryClient());
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    expect(api.last().path).toBe("packages.files");
    api.last().answer({
      brochures: [
        {
          attachmentId: "0190a000-0000-7000-8000-0000000000f1",
          fileName: "kedar.pdf",
          contentType: "application/pdf",
          url: "https://files.test/kedar.pdf",
        },
      ],
    });
    expect(await screen.findByRole("link", { name: "kedar.pdf" })).toBeTruthy();
    expect(screen.queryByTestId("package-qr-input")).toBeNull();
  });

  it("asks before removing a brochure, then removes it by kind and id", async () => {
    const api = fakeApi();
    renderWithApi(<PackageFilesCard packageId={packageId} />, newQueryClient());
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    const attachmentId = "0190a000-0000-7000-8000-0000000000f1";
    api.last().answer({
      brochures: [{ attachmentId, fileName: "kedar.pdf", contentType: "application/pdf", url: null }],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Remove kedar.pdf" }));
    expect(api.calls).toHaveLength(1);
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: messages.packages.files.remove }));
    await waitFor(() => {
      expect(api.calls.length).toBe(2);
    });
    expect(api.last().path).toBe("packages.removeFile");
    expect(api.last().input).toEqual({ packageId, kind: "brochure", attachmentId });
  });

  it("asks where to put a brochure before sending it", async () => {
    const api = fakeApi();
    renderWithApi(<PackageFilesCard packageId={packageId} />, newQueryClient());
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    api.last().answer({ brochures: [] });
    await screen.findByText(messages.packages.files.noBrochures);
    const file = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    await userEvent.upload(screen.getByTestId("package-brochure-input"), file);
    await waitFor(() => {
      expect(api.calls.length).toBe(2);
    });
    expect(api.last().path).toBe("packages.requestFileUpload");
    expect(api.last().input).toEqual({
      packageId,
      kind: "brochure",
      fileName: "plan.pdf",
      contentType: "application/pdf",
      sizeBytes: 4,
    });
  });
});

describe("a package file is checked in the browser first", () => {
  it("refuses a brochure of the wrong type or over 25 MB without sending anything", async () => {
    const api = fakeApi();
    renderWithApi(<PackageFilesCard packageId={packageId} />, newQueryClient());
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    api.last().answer({ brochures: [] });
    await screen.findByText(messages.packages.files.noBrochures);
    const input = screen.getByTestId("package-brochure-input");
    await userEvent.upload(input, new File(["x"], "notes.txt", { type: "text/plain" }), { applyAccept: false });
    expect(await screen.findByText("Choose a PDF or a picture (JPEG, PNG or WebP).")).toBeTruthy();
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 25 * 1024 * 1024 + 1 });
    await userEvent.upload(input, big);
    expect(await screen.findByText(/Choose a file of up to 25 MB/)).toBeTruthy();
    expect(api.calls).toHaveLength(1);
  });
});

describe("DepartureFormDialog on a departure of a package", () => {
  const linked = {
    id: "0190a000-0000-7000-8000-0000000000d1",
    title: "Kedarnath, 3 Nov",
    destinationName: null,
    startDate: "2027-11-03",
    endDate: "2027-11-08",
    pricePaise: null,
    status: "open" as const,
    state: "open" as const,
    seatsTotal: 20,
    sold: 0,
    held: 0,
    free: 20,
    overbookedBy: 0,
    destinationId: null,
    cutoffOn: null,
    notes: "",
    templateId: packageId,
    prices: { ...none, double: 1250000 },
    cancelledReason: null,
    bookings: [],
    holds: [],
    waitlist: [],
  };

  it("shows the room prices instead of the one price, and sends them", async () => {
    const api = fakeApi();
    renderWithApi(<DepartureFormDialog departure={linked} trigger={{ label: "Change" }} />, newQueryClient());
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.queryByRole("textbox", { name: messages.departures.form.price })).toBeNull();
    const double = await screen.findByRole("textbox", { name: "Double" });
    expect((double as HTMLInputElement).value).toBe("12,500");
    await userEvent.click(screen.getByRole("button", { name: messages.departures.form.save }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "departures.update")).toBe(true);
    });
    const sent = api.calls.find((call) => call.path === "departures.update")?.input as {
      prices: unknown;
      templateId: string;
    };
    expect(sent.templateId).toBe(packageId);
    expect(sent.prices).toEqual({ ...none, double: 1250000 });
  });

  it.each([
    { includeGst: false, title: "Prices per person (before GST)" },
    { includeGst: true, title: "Prices per person (including GST)" },
  ])("words the prices by the package's GST switch: $title", async ({ includeGst, title }) => {
    stubApi({
      "packages.get": { data: aPackage({ pricesIncludeGst: includeGst, roomTypes: ["double"] }) },
      "departures.calendar": { data: [] },
    });
    renderScreen(<DepartureFormDialog departure={linked} trigger={{ label: "Change" }} />, { width: "wide" });
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(await screen.findByText(title)).toBeTruthy();
    // An empty room is priced from the season, which the hint says.
    expect(screen.getByText(/priced from the season/)).toBeTruthy();
  });

  it("never resends the hidden single price of a linked departure", async () => {
    const api = fakeApi();
    renderWithApi(
      <DepartureFormDialog departure={{ ...linked, pricePaise: 1250000 }} trigger={{ label: "Change" }} />,
      newQueryClient(),
    );
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    await userEvent.click(await screen.findByRole("button", { name: messages.departures.form.save }));
    await waitFor(() => {
      expect(api.calls.some((call) => call.path === "departures.update")).toBe(true);
    });
    const sent = api.calls.find((call) => call.path === "departures.update")?.input as { pricePaise: unknown };
    expect(sent.pricePaise).toBeNull();
  });
});
