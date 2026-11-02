"use client";

// Departures' reads and changes (release 7a): the list, one departure, its rooming list and money, and every change. A change
// to seats loads again the departure, the lists that show it, Today (its section) and the leads (their holds); a change to a
// quote's departure loads the quotes too.
import type { DepartureFilter } from "@travel-crm/contracts/departures";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useDepartureList(filter: DepartureFilter, enabled = true) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.departures.list.queryOptions({ filter }), enabled });
}

export function useDeparture(departureId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.departures.get.queryOptions({ departureId }));
}

export function useDepartureMoney(departureId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.departures.money.queryOptions({ departureId }), enabled });
}

export function useRooming(departureId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.departures.rooming.get.queryOptions({ departureId }));
}

export function useLeadDepartures(leadId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.departures.forLead.queryOptions({ leadId }), enabled });
}

export function useDepartureSettings() {
  const trpc = useTRPC();
  return useQuery(trpc.departures.settings.queryOptions());
}

/** After any change to a departure: its queries, the quotes and bookings that name it, Today's tasks and the leads. */
export function useRefreshDepartures() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.departures.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.finance.pathKey() }),
      refreshWork(),
    ]).then(() => undefined);
}

export function useDepartureChanges() {
  const trpc = useTRPC();
  const refresh = useRefreshDepartures();
  const options = { onSuccess: refresh };
  return {
    create: useMutation(trpc.departures.create.mutationOptions(options)),
    update: useMutation(trpc.departures.update.mutationOptions(options)),
    setStatus: useMutation(trpc.departures.setStatus.mutationOptions(options)),
    cancel: useMutation(trpc.departures.cancel.mutationOptions(options)),
    hold: useMutation(trpc.departures.hold.mutationOptions(options)),
    releaseHold: useMutation(trpc.departures.releaseHold.mutationOptions(options)),
    addToWaitlist: useMutation(trpc.departures.addToWaitlist.mutationOptions(options)),
    removeFromWaitlist: useMutation(trpc.departures.removeFromWaitlist.mutationOptions(options)),
    makeQuote: useMutation(trpc.departures.makeQuote.mutationOptions(options)),
    setQuoteDeparture: useMutation(trpc.departures.setQuoteDeparture.mutationOptions(options)),
    saveSettings: useMutation(trpc.departures.saveSettings.mutationOptions(options)),
  };
}

export function useRoomingChanges() {
  const trpc = useTRPC();
  const refresh = useRefreshDepartures();
  const options = { onSuccess: refresh };
  return {
    saveStay: useMutation(trpc.departures.rooming.saveStay.mutationOptions(options)),
    removeStay: useMutation(trpc.departures.rooming.removeStay.mutationOptions(options)),
    addRoom: useMutation(trpc.departures.rooming.addRoom.mutationOptions(options)),
    updateRoom: useMutation(trpc.departures.rooming.updateRoom.mutationOptions(options)),
    removeRoom: useMutation(trpc.departures.rooming.removeRoom.mutationOptions(options)),
    move: useMutation(trpc.departures.rooming.move.mutationOptions(options)),
    draft: useMutation(trpc.departures.rooming.draft.mutationOptions(options)),
    copyLayout: useMutation(trpc.departures.rooming.copyLayout.mutationOptions(options)),
  };
}
