// Where a lite sale stands, the next detail the sales checklist asks (K1-K3), and whether a name is worth using.
import type { ChecklistItem, LiteFacts } from "@travel-crm/contracts/ai";
import { isWhatsAppPlaceholderName } from "../../../crm/index.js";
import type { SaleStage, SituationPackage } from "../types.js";

/** The chat's AI booking while it waits for the advance or for a person to check the screenshot. */
export interface OpenBooking {
  id: string;
  status: "awaiting_payment" | "proof_received";
  expectedPaise: number;
}

/** Words people put in a WhatsApp profile that are not what anyone wants to be called. */
const NOT_NAMES = new Set("ok hi hello user customer admin test unknown travel tours holidays mom dad".split(" "));
/** Letters of any script (with their marks, so Devanagari reads whole), spaces, dots, apostrophes and hyphens. */
const NAME_SHAPE = /^[\p{L}\p{M} .'-]{2,60}$/u;
const MOST_NAME_WORDS = 4;

/** K1: a name the agent may call the customer by, so it need not ask. */
export function usableName(name: string | null, phoneE164: string): boolean {
  if (name === null) return false;
  const tidy = name.trim().replace(/\s+/gu, " ");
  return (
    NAME_SHAPE.test(tidy) &&
    /\p{L}/u.test(tidy) &&
    tidy.split(" ").length <= MOST_NAME_WORDS &&
    !isWhatsAppPlaceholderName(name, phoneE164) &&
    !NOT_NAMES.has(tidy.toLowerCase())
  );
}

/** No name, or a first name only, is not enough for a booking. */
const fullName = (name: string | null) => name !== null && name.trim().split(/\s+/u).length >= 2;

/**
 * The first checklist item the facts don't hold (K1-K3); the caller has already folded in what the lead holds. Pickup
 * and room only when the package offers a choice; the full name only at booking, and only once. Budget, food, hotel
 * and occasion are never asked.
 */
export function nextItem(
  facts: LiteFacts,
  pkg: SituationPackage | null,
  nameUsable: boolean,
  booking: boolean,
): ChecklistItem | null {
  const children = facts.children;
  if (!nameUsable && facts.name === null && !facts.nameSkipped) return "name";
  if (facts.packageId === null) return "where";
  if (facts.departureId === null) return "when";
  if (facts.adults === null) return "people";
  if (children !== null && children.ages.length < children.count) return "children_ages";
  if (facts.pickupCity === null && (pkg?.pickups.length ?? 0) >= 2) return "pickup";
  if (facts.roomType === null && (pkg?.adultRooms.length ?? 0) >= 2) return "room";
  if (booking && !facts.fullNameAsked && !fullName(facts.name)) return "full_name";
  return null;
}

export function saleStageOf(
  facts: LiteFacts,
  openBooking: OpenBooking | null,
  pkg: SituationPackage | null,
): SaleStage {
  if (openBooking?.status === "proof_received") return "payment_to_check";
  if (openBooking?.status === "awaiting_payment") return "waiting_for_payment";
  if (facts.quoted !== null && facts.quoted.departureId === facts.departureId) return "quoted";
  // The trip's details: the name is asked first or skipped, and is no part of what the price needs.
  const tripKnown = facts.departureId !== null && facts.adults !== null && nextItem(facts, pkg, true, false) === null;
  if (facts.packageId !== null && tripKnown) return "details_complete";
  return facts.packageId === null ? "exploring" : "package_picked";
}
