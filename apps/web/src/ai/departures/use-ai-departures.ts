"use client";

// The api side of AI on a departure (release ai3): reading room requests from notes, finding the people worth asking about empty
// seats, writing a message for one of them, and marking an offer sent. Reading and writing each spend one of the month's AI calls.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useReadRoomRequests() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.departures.readRoomRequests.mutationOptions());
}

export function useInterestedPeople(departureId: string, enabled: boolean) {
  const trpc = useTRPC();
  // Fresh each time the dialog opens: who was offered the seats a minute ago must not appear again.
  return useQuery({
    ...trpc.ai.departures.findInterested.queryOptions({ departureId }),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useWriteSeatMessage() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.departures.writeSeatMessage.mutationOptions());
}

export function useMarkOfferSent() {
  const trpc = useTRPC();
  // The lead's timeline has a new note.
  const refreshWork = useRefreshWork();
  return useMutation(trpc.ai.departures.markOfferSent.mutationOptions({ onSuccess: refreshWork }));
}
