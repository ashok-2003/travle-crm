"use client";

// The autopilot's media and bookings (the owner, 2026-10-29): the files the agency gives its AI to send, and the bookings
// it took on a lead. A change loads again only what shows it: the media list, or the lead's bookings and the lead itself
// (a confirmed booking wins the lead).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useAiMedia() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.media.queryOptions());
}

function useMediaChange() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.ai.media.pathKey() });
}

export function useRequestMedia() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.requestMedia.mutationOptions());
}

export function useConfirmMedia() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.confirmMedia.mutationOptions({ onSuccess: useMediaChange() }));
}

export function useUpdateMedia() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.updateMedia.mutationOptions({ onSuccess: useMediaChange() }));
}

export function useDeleteMedia() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.deleteMedia.mutationOptions({ onSuccess: useMediaChange() }));
}

/** The bookings the AI took on a lead, with the customer's payment proofs. */
export function useLeadBookings(leadId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.ai.bookingsForLead.queryOptions({ leadId }));
}

export function useSetBookingStatus(leadId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.ai.setBookingStatus.mutationOptions({
      onSuccess: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.ai.bookingsForLead.queryKey({ leadId }) }),
          queryClient.invalidateQueries({ queryKey: trpc.leads.pathKey() }),
        ]),
    }),
  );
}
