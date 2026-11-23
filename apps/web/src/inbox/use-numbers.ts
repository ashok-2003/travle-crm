"use client";

// The agency's WhatsApp numbers as the inbox shows them (spec 2026-11-22 section 11), from inbox.status: every number it
// has had, the live ones first with the main one leading. Labels and number choices show only once two numbers are live,
// so an agency with one number (however many it had before) sees no change.
import type { WhatsappNumber } from "@travel-crm/contracts/inbox";
import { useInboxStatus } from "./use-inbox";

export interface InboxNumbers {
  /** Every number the agency has had: the live ones first, the main one leading, then the disconnected ones. */
  numbers: WhatsappNumber[];
  /** The live numbers, the main one first. */
  live: WhatsappNumber[];
  /** Whether labels and number choices show: two numbers or more are live. */
  show: boolean;
  /** A number's label, while labels show; null otherwise, or for a number not known. */
  labelOf: (connectionId: string) => string | null;
}

export function useNumbers(): InboxNumbers {
  const numbers = useInboxStatus().data?.numbers ?? [];
  const live = numbers.filter((number) => number.status !== "disconnected");
  const show = live.length >= 2;
  return {
    numbers,
    live,
    show,
    labelOf: (connectionId) => (show ? (numbers.find((number) => number.id === connectionId)?.label ?? null) : null),
  };
}
