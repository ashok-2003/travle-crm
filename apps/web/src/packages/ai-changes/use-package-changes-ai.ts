"use client";

// The api side of "Tell the AI what changed": whether to offer the box, the proposal (one AI call), a photo or PDF put
// straight in storage (requested, sent with the presigned PUT, confirmed: file bytes never pass through the api), and
// Apply and Undo all, after which the trip, its departures calendar and the packages lists load again.
import type { UndoPackageChangesResult } from "@travel-crm/contracts/ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAiAvailability } from "@/ai/use-ai";
import { useTRPC } from "@/data/trpc";
import { uploadFile } from "@/files/upload";
import { useHolds } from "@/session/me-context";

export type ChangeInputType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";

/** Whether to offer the box: the role holds quotes:edit and ai:suggest, the plan has the AI and the agency has it on. */
export function usePackageChangesAvailable(): boolean {
  const mayEdit = useHolds("quotes:edit");
  return useAiAvailability() === "on" && mayEdit;
}

export function useProposeChanges() {
  const trpc = useTRPC();
  return useMutation(trpc.ai.packageChanges.propose.mutationOptions());
}

/** The proposal and one change as the api sends them (the contract's own types differ in how a trip field's values are optional). */
export type ProposedChanges = NonNullable<ReturnType<typeof useProposeChanges>["data"]>;
export type ProposedChange = ProposedChanges["changes"][number];

export function useUploadChangeInput() {
  const trpc = useTRPC();
  const request = useMutation(trpc.ai.packageChanges.requestInput.mutationOptions());
  const confirm = useMutation(trpc.ai.packageChanges.confirmInput.mutationOptions());
  return async (file: Blob, contentType: ChangeInputType) => {
    const slot = await request.mutateAsync({ contentType, sizeBytes: file.size });
    await uploadFile(slot.upload, file);
    await confirm.mutateAsync({ recordId: slot.recordId, attachmentId: slot.attachmentId });
    return slot.attachmentId;
  };
}

/** The trip's latest applied run, which Undo all may still put back. */
export function useLatestChangeRun(packageId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.ai.packageChanges.latest.queryOptions({ packageId }), enabled });
}

function useRefreshTrip() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.departures.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.ai.packageChanges.latest.pathKey() }),
    ]);
}

export function useApplyChanges(onApplied: (applied: number) => void) {
  const trpc = useTRPC();
  const refresh = useRefreshTrip();
  return useMutation(
    trpc.ai.packageChanges.applyChanges.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        onApplied(result.applied);
      },
    }),
  );
}

export function useUndoChanges(onUndone: (result: UndoPackageChangesResult) => void) {
  const trpc = useTRPC();
  const refresh = useRefreshTrip();
  return useMutation(
    trpc.ai.packageChanges.undo.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        onUndone(result);
      },
    }),
  );
}
