// What the business profile's tests share: the profile onboarding saved, the subscription's answer and the Owner.
import type { BusinessProfileDetails } from "@travel-crm/contracts/profile";
import { member } from "../support/members";

export const saved: BusinessProfileDetails = {
  legalName: "Konkan Trails LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: null,
  contactName: "Lakshmi Nair",
  contactPhone: "+919820012345",
  bankAccountName: null,
  bankAccountNumber: null,
  bankIfsc: null,
  bankName: null,
  invoicePrefix: null,
  updatedAt: "2026-10-16T05:00:00.000Z",
};

export const subscription = (access: "full" | "read_only") => ({
  data: {
    status: access === "full" ? "active" : "read_only",
    access,
    planName: "Growth",
    modules: [],
    trialEndsOn: null,
    paidThrough: null,
    nextChangeOn: null,
    limits: { seats: 10, whatsappNumbers: 1, storageBytes: 1000 },
  },
});

export const owner = member({ isOwner: true });
