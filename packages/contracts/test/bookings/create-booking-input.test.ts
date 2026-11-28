// A booking made in one step takes a total no larger than a quote's line may hold, so its quote can always be read back.
import { createBookingInput } from "@travel-crm/contracts/bookings";
import { MAX_QUOTE_PAISE } from "@travel-crm/contracts/quotes";
import { describe, expect, it } from "vitest";

const input = {
  leadId: "0199b000-0000-7000-8000-000000000001",
  packageId: null,
  departureId: null,
  title: "Goa",
  startDate: null,
  adults: 2,
  children: 0,
  totalPaise: 1_000_00,
  taxRateBasisPoints: 500,
};

describe("createBookingInput", () => {
  it("takes the largest total a quote holds and refuses one more paisa", () => {
    expect(createBookingInput.safeParse({ ...input, totalPaise: MAX_QUOTE_PAISE }).success).toBe(true);
    expect(createBookingInput.safeParse({ ...input, totalPaise: MAX_QUOTE_PAISE + 1 }).success).toBe(false);
  });
});
