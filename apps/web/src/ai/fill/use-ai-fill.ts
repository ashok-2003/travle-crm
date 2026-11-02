"use client";

// The api side of "Fill it for me": whether to offer it, the proposal for a target, and a recording or screenshot put straight
// in storage (requested, sent with the presigned PUT, confirmed): file bytes never pass through the api.
import type { FillTarget } from "@travel-crm/contracts/ai";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { uploadFile } from "@/files/upload";
import { useHolds } from "@/session/me-context";
import { useSuggestReplyAvailable } from "../use-ai";

/** Whether to offer the button for a target: the plan has the AI, the agency turned it on, the role holds both permissions. */
export function useFillAvailable(target: FillTarget): boolean {
  const available = useSuggestReplyAvailable();
  const holdsLead = useHolds("leads:create");
  const holdsEdit = useHolds("leads:edit");
  const holdsQuote = useHolds("quotes:edit");
  return available && (target === "lead" ? holdsLead : target === "quote" ? holdsQuote : holdsEdit);
}

export function useFill(target: FillTarget) {
  const trpc = useTRPC();
  const lead = useMutation(trpc.ai.fill.lead.mutationOptions());
  const edit = useMutation(trpc.ai.fill.leadEdit.mutationOptions());
  const quote = useMutation(trpc.ai.fill.quote.mutationOptions());
  return target === "lead" ? lead : target === "quote" ? quote : edit;
}

/** Puts a recording or a screenshot in storage and returns its attachment, ready for the fill to read. */
export function useUploadAiInput() {
  const trpc = useTRPC();
  const request = useMutation(trpc.ai.fill.requestInput.mutationOptions());
  const confirm = useMutation(trpc.ai.fill.confirmInput.mutationOptions());
  return async (file: Blob, contentType: "audio/wav" | "image/jpeg" | "image/png" | "image/webp") => {
    const slot = await request.mutateAsync({ contentType, sizeBytes: file.size });
    await uploadFile(slot.upload, file);
    await confirm.mutateAsync({ recordId: slot.recordId, attachmentId: slot.attachmentId });
    return slot.attachmentId;
  };
}
