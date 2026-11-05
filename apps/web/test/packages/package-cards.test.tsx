// A group package's departures and files, and the room prices on a linked departure's form.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { DepartureFormDialog } from "@/departures/departure-form-dialog";
import { PackageDeparturesCard } from "@/packages/package-departures-card";
import { PackageFilesCard } from "@/packages/package-files-card";
import { messages } from "@/i18n/messages";
import { fakeApi, newQueryClient, renderWithApi } from "../organization/api";
import { screenIs } from "../organization/render";
import { aPackage } from "./detail";

const packageId = aPackage().id;
const none = { single: null, double: null, triple: null, quad: null, child_bed: null, child_no_bed: null };

beforeEach(() => {
  screenIs("wide");
});

describe("PackageDeparturesCard", () => {
  it("asks for this package's departures and shows the day, the name and the seats left", async () => {
    const api = fakeApi();
    renderWithApi(<PackageDeparturesCard packageId={packageId} />, newQueryClient());
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    expect(api.last().path).toBe("departures.list");
    expect(api.last().input).toEqual({ filter: "upcoming", templateId: packageId });
    api.last().answer([
      {
        id: "0190a000-0000-7000-8000-0000000000d1",
        title: "Kedarnath, 3 Nov",
        destinationName: null,
        startDate: "2027-11-03",
        endDate: "2027-11-08",
        pricePaise: null,
        status: "open",
        state: "open",
        seatsTotal: 20,
        sold: 8,
        held: 2,
        free: 10,
        overbookedBy: 0,
      },
    ]);
    expect(await screen.findByRole("link", { name: "Kedarnath, 3 Nov" })).toBeTruthy();
    expect(screen.getByText("3 Nov 2027")).toBeTruthy();
    expect(screen.getByText("10 of 20 seats left")).toBeTruthy();
  });
});

describe("PackageFilesCard", () => {
  it("lists the brochures and the QR", async () => {
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
      paymentQr: null,
    });
    expect(await screen.findByRole("link", { name: "kedar.pdf" })).toBeTruthy();
    expect(screen.getByText(messages.packages.files.noQr)).toBeTruthy();
    expect(screen.getByRole("button", { name: messages.packages.files.addQr })).toBeTruthy();
  });

  it("asks where to put a brochure before sending it", async () => {
    const api = fakeApi();
    renderWithApi(<PackageFilesCard packageId={packageId} />, newQueryClient());
    await waitFor(() => {
      expect(api.calls.length).toBe(1);
    });
    api.last().answer({ brochures: [], paymentQr: null });
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
});
