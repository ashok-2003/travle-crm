"use client";

// The api side of reading a rate sheet (release ai3b): the file put straight in storage (requested, sent with the presigned PUT,
// confirmed: file bytes never pass through the api), the read itself (one AI call), a link to open the sheet beside its rows, and
// the save of the checked rows, which loads the supplier's rates again.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { uploadFile } from "@/files/upload";

export type RateSheetContentType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | typeof XLSX_TYPE;
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function useReadRateSheet() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.rates.read.mutationOptions());
}

/** Puts a rate sheet file or photo in storage and returns its attachment, ready for the read. */
export function useUploadRateSheet() {
  const trpc = useTRPC();
  const request = useMutation(trpc.ai.rates.requestInput.mutationOptions());
  const confirm = useMutation(trpc.ai.rates.confirmInput.mutationOptions());
  return async (file: Blob, contentType: RateSheetContentType) => {
    const slot = await request.mutateAsync({ contentType, sizeBytes: file.size });
    await uploadFile(slot.upload, file);
    await confirm.mutateAsync({ recordId: slot.recordId, attachmentId: slot.attachmentId });
    return slot.attachmentId;
  };
}

export function useRateSheetSource() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.rates.sourceLink.mutationOptions());
}

export function useSaveRateBatch() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.suppliers.saveRateBatch.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.suppliers.rates.pathKey() }),
    }),
  );
}
