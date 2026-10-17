// A customer's export in the console (R39): before erasing a "person" record, the super admin sees the customer's
// contacts and how much is kept about their leads, and copies the whole of it as JSON to hand to them.
import type { CustomerExport, ExportedLead, SubjectExport } from "@travel-crm/contracts/platform";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubjectExportView } from "@/console/data-protection/subject-export-view";
import { messages } from "@/i18n/messages";
import { renderConsole } from "../../support/render-console";

const words = messages.consolePlatform.dataProtection.subject.customer;

const trip: ExportedLead["trip"] = {
  destination: { id: "0199a000-0000-7000-8000-0000000000d1", name: "Kashmir" },
  when: { kind: "month", month: "2026-12" },
  adults: 2,
  childrenAges: [6],
  budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "per_person" },
  departureCity: "Pune",
  tripType: "family",
  hotelCategory: "4_star",
  food: "veg",
  roomType: null,
};

const task = (title: string): ExportedLead["tasks"][number] => ({
  kind: "follow-up",
  title,
  dueAt: "2026-10-20T05:00:00.000Z",
  doneAt: null,
  cancelledAt: null,
});

const customer: CustomerExport = {
  personId: "0199a000-0000-7000-8000-0000000000d0",
  name: "Priya Nair",
  phone: "+919876543210",
  email: "priya@example.test",
  instagramHandle: "priya.travels",
  leads: [
    {
      leadId: "0199a000-0000-7000-8000-0000000000d2",
      stage: "contacted",
      source: "referral",
      sourceDetail: "Referred by Meera",
      createdAt: "2026-10-01T05:00:00.000Z",
      trip,
      notes: [
        { body: "Wants a houseboat", createdAt: "2026-10-01T05:00:00.000Z" },
        { body: "Call after 6 pm", createdAt: "2026-10-02T05:00:00.000Z" },
      ],
      enquiries: [
        { trip, source: "phone_call", sourceDetail: null, note: "Asked again", createdAt: "2026-10-03T05:00:00.000Z" },
      ],
      tasks: [task("Send the Kashmir quote"), task("Call back")],
    },
    {
      leadId: "0199a000-0000-7000-8000-0000000000d3",
      stage: "won",
      source: "walk_in",
      sourceDetail: null,
      createdAt: "2025-04-01T05:00:00.000Z",
      trip: { ...trip, destination: null },
      notes: [],
      enquiries: [],
      tasks: [task("Collect the balance")],
    },
  ],
};

const exported = (part: CustomerExport | null): SubjectExport => ({
  exportedAt: new Date().toISOString(),
  person: null,
  customer: part,
  auditEntries: [],
  files: [],
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a customer's export", () => {
  it("shows the customer's contacts and counts, and copies the export as JSON", async () => {
    const user = userEvent.setup();
    renderConsole(<SubjectExportView exported={exported(customer)} />);

    expect(screen.getByText("Priya Nair")).toBeVisible();
    expect(screen.getByText("+91 98765 43210")).toBeVisible();
    expect(screen.getByText("priya@example.test")).toBeVisible();
    expect(screen.getByText("@priya.travels")).toBeVisible();
    expect(screen.getByText("2 leads · 2 notes · 1 repeat enquiry · 3 tasks")).toBeVisible();

    await user.click(screen.getByRole("button", { name: words.copy }));

    expect(JSON.parse(await navigator.clipboard.readText())).toEqual(customer);
  });

  it("shows only the contacts the customer has, and says when they were erased", () => {
    renderConsole(
      <SubjectExportView
        exported={exported({ ...customer, name: "", phone: null, email: null, instagramHandle: null, leads: [] })}
      />,
    );
    expect(screen.getByText(words.erased)).toBeVisible();
    expect(screen.queryByText(words.phone)).toBeNull();
    expect(screen.getByText("0 leads · 0 notes · 0 repeat enquiries · 0 tasks")).toBeVisible();
  });

  it("has no customer part for a member or another record", () => {
    renderConsole(<SubjectExportView exported={exported(null)} />);
    expect(screen.queryByRole("button", { name: words.copy })).toBeNull();
  });
});
