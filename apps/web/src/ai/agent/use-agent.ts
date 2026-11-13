"use client";

// The AI agent page's reads: the setup checklist and state, the chats handed over, the payments waiting, the last day.
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";

/** `enabled` false for a screen outside the AI agent page that asks only when it matters (the api needs ai:manage). */
export function useAgentSetup(enabled = true) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.ai.agentSetup.queryOptions(), staleTime: 30_000, enabled });
}

/** Chats the agent handed over; the api needs inbox:view too, so a member without it never asks. */
export function useHandedOver() {
  const trpc = useTRPC();
  const may = useHolds("inbox:view");
  return { may, query: useQuery({ ...trpc.ai.handedOver.queryOptions(), enabled: may, staleTime: 30_000 }) };
}

/** Payments to check; the api needs bookings:view and quotes:record_payments. */
export function usePaymentsToCheckCount() {
  const trpc = useTRPC();
  const mayView = useHolds("bookings:view");
  const mayRecord = useHolds("quotes:record_payments");
  const may = mayView && mayRecord;
  return { may, query: useQuery({ ...trpc.paymentsToCheck.count.queryOptions(), enabled: may, staleTime: 30_000 }) };
}

/** The AI's open suggestions to mark a lead Lost or Not a lead; the api needs leads:view. */
export function useStageSuggestions() {
  const trpc = useTRPC();
  const may = useHolds("leads:view");
  return { may, query: useQuery({ ...trpc.ai.stageSuggestions.queryOptions(), enabled: may, staleTime: 30_000 }) };
}
