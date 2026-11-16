"use client";

// The bookings the AI took on a lead: read with the customer's payment proofs, and confirmed or cancelled by a person. A change
// loads again only what shows it: the lead's bookings and the lead itself (a confirmed booking wins the lead).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRefreshBookings } from "@/bookings/use-bookings";
import { useTRPC } from "@/data/trpc";

/** The bookings the AI took on a lead, with the customer's payment proofs. */
export function useLeadBookings(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.ai.bookingsForLead.queryOptions({ leadId }));
}

export function useSetBookingStatus(leadId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Confirming makes a quote, a booking and a payment: their screens and Today's tasks load again too.
  const refreshBookings = useRefreshBookings();
  return useMutation(
    trpc.ai.setBookingStatus.mutationOptions({
      onSuccess: () =>
        Promise.all([
          refreshBookings(),
          queryClient.invalidateQueries({ queryKey: trpc.ai.bookingsForLead.queryKey({ leadId }) }),
          queryClient.invalidateQueries({ queryKey: trpc.leads.pathKey() }),
        ]),
    }),
  );
}
