"use client";

// The Setup tab's reads and saves. Every save asks for the checklist again (its done marks follow the data) and puts
// what the api kept in its own query, so the editor shows it at once.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";

function useRefreshChecklist() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.ai.agentSetup.queryKey() });
}

export function usePaymentDetails(enabled: boolean) {
  const trpc = useTRPC();
  // The bank account is in it: never kept in the device's saved copy.
  return useQuery({
    ...trpc.organization.paymentDetails.get.queryOptions(undefined, { meta: { persist: false } }),
    enabled,
  });
}

export function usePaymentDetailsChanges() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const refreshChecklist = useRefreshChecklist();
  const key = trpc.organization.paymentDetails.get.queryKey();
  const kept = async () => {
    await queryClient.invalidateQueries({ queryKey: key });
    // The profile screen's form holds the same bank details: saving it from a stale copy would write the old ones back.
    await queryClient.invalidateQueries({ queryKey: trpc.organization.profile.get.queryKey() });
    await refreshChecklist();
  };
  const save = useMutation(trpc.organization.paymentDetails.save.mutationOptions({ onSuccess: kept }));
  const remove = useMutation(trpc.organization.paymentDetails.removeQr.mutationOptions({ onSuccess: kept }));
  // Three steps, as a package's QR: ask where to put it, put it straight into storage, name it.
  const addQr = useMutation({
    mutationFn: async (file: File) => {
      const slot = await client.organization.paymentDetails.requestQrUpload.mutate({
        fileName: file.name,
        contentType: file.type as never,
        sizeBytes: file.size,
      });
      await uploadFile(slot.upload, file);
      await client.organization.paymentDetails.confirmQr.mutate({ attachmentId: slot.attachmentId });
    },
    onSettled: kept,
  });
  return { save, remove, addQr };
}

export function useAgencyAnswers() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.agencyAnswers.queryOptions());
}

export function useSaveAnswers() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshChecklist = useRefreshChecklist();
  return useMutation(
    trpc.ai.saveAgencyAnswers.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.ai.agencyAnswers.queryKey() });
        await refreshChecklist();
      },
    }),
  );
}

export function useAgentBasics() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.agentBasics.queryOptions());
}

export function useSaveBasics() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshChecklist = useRefreshChecklist();
  return useMutation(
    trpc.ai.saveAgentBasics.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.ai.agentBasics.queryKey() });
        // Settings, AI shows the same on/off and basics: a stale copy there would save the old values back.
        await queryClient.invalidateQueries({ queryKey: trpc.ai.autopilot.queryKey() });
        await refreshChecklist();
      },
    }),
  );
}

export function useAds() {
  const trpc = useTRPC();
  return useQuery(trpc.ai.ads.queryOptions());
}

export function useLinkAd() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshChecklist = useRefreshChecklist();
  return useMutation(
    trpc.ai.linkAd.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.ai.ads.queryKey() });
        await refreshChecklist();
      },
    }),
  );
}

export function useSetAgentOn() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.ai.setAgentOn.mutationOptions({
      onSuccess: (setup) => {
        queryClient.setQueryData(trpc.ai.agentSetup.queryKey(), setup);
        // Settings, AI shows the same on/off: a stale copy there would save the old one back.
        void queryClient.invalidateQueries({ queryKey: trpc.ai.autopilot.queryKey() });
      },
    }),
  );
}
