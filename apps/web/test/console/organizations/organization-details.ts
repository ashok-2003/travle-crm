// organizations.get's answer for the console's tests: an agency on a monthly plan, active and paid through a day, its
// business profile with the bank account masked as the api masks it, and no payments yet.
import type { OrganizationDetails } from "@travel-crm/contracts/platform";
import type { SubscriptionDetails } from "@travel-crm/contracts/subscriptions";

export const organizationId = "0199a000-0000-7000-8000-000000000002";

export function subscriptionDetails(overrides: Partial<SubscriptionDetails> = {}): SubscriptionDetails {
  return {
    organizationId,
    plan: { id: "0199a000-0000-7000-8000-0000000000c1", key: "growth", name: "Growth" },
    billingCycle: "monthly",
    status: "active",
    access: "full",
    since: "2026-10-01",
    nextChangeOn: "2026-11-01",
    recorded: { status: "active", since: "2026-10-01" },
    manualSuspension: null,
    trialEndsOn: null,
    paidThrough: "2026-10-31",
    extraSeats: 0,
    customPricePaise: null,
    extraModules: [],
    price: {
      cycle: "monthly",
      basePaise: 250_000,
      extraSeats: 0,
      extraSeatsPaise: 0,
      subtotalPaise: 250_000,
      cgstPaise: 22_500,
      sgstPaise: 22_500,
      gstPaise: 45_000,
      totalPaise: 295_000,
    },
    ...overrides,
  };
}

export function organizationDetails(overrides: Partial<OrganizationDetails> = {}): OrganizationDetails {
  return {
    organization: {
      id: organizationId,
      name: "Kerala Trails",
      code: "KERALA",
      timeZone: "Asia/Kolkata",
      contactEmail: "hello@keralatrails.example",
      createdAt: "2026-10-01T04:30:00.000Z",
    },
    profile: {
      legalName: "Kerala Trails LLP",
      gstin: "32AAPFU0939F1Z4",
      gstStateCode: "32",
      address: null,
      contactName: "Lakshmi Nair",
      contactPhone: "+919876543210",
      bankAccountName: "Kerala Trails LLP",
      bankAccountNumber: "XXXX7890",
      bankIfsc: "HDFC0001234",
      bankName: "HDFC Bank",
      invoicePrefix: "KT",
      brandColour: null,
      documentTerms: null,
      updatedAt: "2026-10-02T04:30:00.000Z",
    },
    subscription: { subscription: subscriptionDetails(), payments: [] },
    ...overrides,
  };
}
