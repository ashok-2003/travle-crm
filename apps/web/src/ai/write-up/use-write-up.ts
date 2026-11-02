"use client";

// The api side of the quote write-up: one message for the customer, which spends one of the agency's monthly AI calls.
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useWriteUp() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.writeUp.mutationOptions());
}
