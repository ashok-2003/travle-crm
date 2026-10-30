"use client";

// A record's files and what can be done to one: list them, download one by a short-lived link (useDownload), remove
// one. Toasts, and closing the dialog that asked to remove a file, live in the hooks' mutation options, not in callers'
// mutate() options, so they don't depend on the calling component staying mounted. A refusal to remove shows in that
// dialog.
import type { AttachmentSummary } from "@travel-crm/contracts/files";
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useDownload } from "./use-download";

/** The record a file belongs to: every call names it, so the api can check who may use that record's files. */
export interface AttachmentRecord {
  recordType: string;
  recordId: string;
}

/** The files of a booking (its tickets and what travellers sent) are the bookings' to serve; the organization's papers, the attachments'. */
const BOOKING_RECORD_TYPES: readonly string[] = [
  "booking_voucher",
  "payment_claim",
  "booking_feedback",
  "booking_traveller",
];
export const isBookingRecord = (
  record: AttachmentRecord,
): record is AttachmentRecord & { recordType: BookingFileType } => BOOKING_RECORD_TYPES.includes(record.recordType);
type BookingFileType = "booking_voucher" | "payment_claim" | "booking_feedback" | "booking_traveller";

export function useAttachments(record: AttachmentRecord): UseQueryResult<AttachmentSummary[]> {
  const trpc = useTRPC();
  const options = isBookingRecord(record)
    ? trpc.bookings.files.list.queryOptions(record)
    : trpc.attachments.list.queryOptions(record);
  return useQuery(options) as UseQueryResult<AttachmentSummary[]>;
}

export function useRefreshAttachments(record: AttachmentRecord) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      queryKey: isBookingRecord(record)
        ? trpc.bookings.files.list.queryKey(record)
        : trpc.attachments.list.queryKey(record),
    });
}

export function useDownloadAttachment() {
  const client = useTRPCClient();
  return useDownload((file: AttachmentRecord & { attachmentId: string }) =>
    isBookingRecord(file)
      ? client.bookings.files.downloadLink.mutate(file)
      : client.attachments.downloadLink.mutate(file),
  );
}

/** Removing a file; `onRemoved` closes the dialog that asked. */
export function useRemoveAttachment(record: AttachmentRecord, name: string, onRemoved: () => void) {
  const refresh = useRefreshAttachments(record);
  const t = useTranslations("business.attachments");
  const client = useTRPCClient();
  return useMutation({
    mutationFn: (file: AttachmentRecord & { attachmentId: string }) =>
      isBookingRecord(file) ? client.bookings.files.remove.mutate(file) : client.attachments.remove.mutate(file),
    onSuccess: () => {
      toast.success(t("removed", { name }));
      onRemoved();
    },
    onSettled: refresh,
  });
}
