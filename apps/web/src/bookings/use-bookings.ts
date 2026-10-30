"use client";

// Bookings' reads and changes (release 6): the list a page at a time, one booking, a lead's bookings in brief, the settings,
// and every change. A change loads again the booking, the lists that show it, the quotes (the money is the quote's), and
// Today and the leads (its tasks and its lead's timeline).
import type { ListBookingsInput } from "@travel-crm/contracts/bookings";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { refusalOf } from "@/data/api-error";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";

export function useBookingList(filter: Omit<ListBookingsInput, "cursor">) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.bookings.list.pathKey(), filter],
    page: (cursor) => client.bookings.list.query({ ...filter, ...(cursor === null ? {} : { cursor }) }),
    items: (page) => page.items,
  });
}

export function useBooking(bookingId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.bookings.get.queryOptions({ bookingId }));
}

export function useLeadBookings(leadId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.bookings.forLead.queryOptions({ leadId }), enabled });
}

export function useCancelPreview(bookingId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.bookings.cancelPreview.queryOptions({ bookingId }), enabled, gcTime: 0 });
}

export function useDefaultSchedule(bookingId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.bookings.defaultSchedule.queryOptions({ bookingId }), enabled, gcTime: 0 });
}

export function useBookingSettings() {
  const trpc = useTRPC();
  return useQuery(trpc.bookings.settings.queryOptions());
}

export function useSaveBookingSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.bookings.saveSettings.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() }),
    }),
  );
}

/** After any change to a booking: every booking query, the quotes (their money), Today's tasks and the leads. */
export function useRefreshBookings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.bookings.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
      refreshWork(),
    ]).then(() => undefined);
}

export function useBookingChanges() {
  const trpc = useTRPC();
  const refresh = useRefreshBookings();
  const options = { onSuccess: refresh };
  return {
    confirm: useMutation(trpc.bookings.confirm.mutationOptions(options)),
    saveSchedule: useMutation(trpc.bookings.saveSchedule.mutationOptions(options)),
    saveEssentials: useMutation(trpc.bookings.saveEssentials.mutationOptions(options)),
    saveStay: useMutation(trpc.bookings.saveStay.mutationOptions(options)),
    removeStay: useMutation(trpc.bookings.removeStay.mutationOptions(options)),
    setLevel: useMutation(trpc.bookings.setLevel.mutationOptions(options)),
    setTravellerCount: useMutation(trpc.bookings.setTravellerCount.mutationOptions(options)),
    saveTraveller: useMutation(trpc.bookings.saveTraveller.mutationOptions(options)),
    issueVoucher: useMutation(trpc.bookings.issueVoucher.mutationOptions(options)),
    prepareTripPdf: useMutation(trpc.bookings.prepareTripPdf.mutationOptions(options)),
    tripLink: useMutation(trpc.bookings.tripLink.mutationOptions(options)),
    pauseReminders: useMutation(trpc.bookings.pauseReminders.mutationOptions(options)),
    recordTripUpdates: useMutation(trpc.bookings.recordTripUpdates.mutationOptions(options)),
    requestFeedback: useMutation(trpc.bookings.requestFeedback.mutationOptions(options)),
    cancel: useMutation(trpc.bookings.cancel.mutationOptions(options)),
    markRefunded: useMutation(trpc.bookings.markRefunded.mutationOptions(options)),
    confirmClaim: useMutation(trpc.bookings.confirmClaim.mutationOptions(options)),
    rejectClaim: useMutation(trpc.bookings.rejectClaim.mutationOptions(options)),
  };
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * A booking's PDF in a new tab: a voucher or the itinerary issued as it stands now (or an earlier one, opened), then its
 * short-lived link once the worker has rendered it. The tab is opened inside the tap so the browser does not block it.
 */
export function useBookingDocument(bookingId: string) {
  const client = useTRPCClient();
  const refresh = useRefreshBookings();
  return useMutation({
    mutationFn: async (
      which: { kind: "voucher"; stayId: string } | { kind: "trip" } | { kind: "open"; documentId: string },
    ) => {
      const tab = window.open("about:blank", "_blank");
      try {
        const documentId =
          which.kind === "open"
            ? which.documentId
            : (which.kind === "voucher"
                ? await client.bookings.issueVoucher.mutate({ stayId: which.stayId })
                : await client.bookings.prepareTripPdf.mutate({ bookingId })
              ).documentId;
        for (let attempt = 0; ; attempt += 1) {
          try {
            const link = await client.bookings.documentLink.mutate({ bookingId, documentId });
            if (tab === null) window.location.assign(link.url);
            else tab.location.href = link.url;
            return documentId;
          } catch (error) {
            if (attempt >= 15 || refusalOf(error)?.reason !== "DOCUMENT_NOT_READY") throw error;
            await pause(2000);
          }
        }
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
    onSettled: refresh,
  });
}
