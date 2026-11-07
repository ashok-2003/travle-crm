// A package page's dates: the price on a date is the lowest an adult pays, so it says "From".
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnquirySection } from "@/package-pages/enquiry-section";
import { newQueryClient, renderWithApi } from "../organization/api";

describe("EnquirySection", () => {
  it("says 'From' before a date's price", () => {
    const page = {
      package: { name: "Kedarnath", slug: "kedarnath" },
      agency: { name: "Acme" },
      form: { openedToken: "t", turnstileSiteKey: null, months: [], consentLine: "" },
      departures: [
        {
          id: "0190a000-0000-7000-8000-0000000000d1",
          destinationId: null,
          title: "Kedarnath",
          startDate: "2027-11-03",
          endDate: "2027-11-08",
          word: "open",
          pricePaise: 1250000,
        },
      ],
    };
    renderWithApi(<EnquirySection code="acme" page={page as never} />, newQueryClient());
    expect(screen.getByText("From ₹12,500 per person")).toBeTruthy();
  });
});
