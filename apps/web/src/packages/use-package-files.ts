"use client";

// A package's brochures and payment QR (group packages): the list, and adding (three steps: ask where to put the file, put
// it straight into storage, name it) and removing one. Every change loads the files again. The QR is where customers pay,
// so it goes through procedures of its own (whoever manages settings).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";

export function usePackageFiles(packageId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.packages.files.queryOptions({ packageId }));
}

function useRefreshFiles(packageId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.packages.files.queryKey({ packageId }) });
}

export function usePackageFileChanges(packageId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const refresh = useRefreshFiles(packageId);
  const add = useMutation({
    mutationFn: async (file: File) => {
      const slot = await client.packages.requestFileUpload.mutate({
        packageId,
        kind: "brochure",
        fileName: file.name,
        contentType: file.type as never,
        sizeBytes: file.size,
      });
      await uploadFile(slot.upload, file);
      await client.packages.confirmFile.mutate({ packageId, kind: "brochure", attachmentId: slot.attachmentId });
    },
    onSettled: refresh,
  });
  const remove = useMutation(trpc.packages.removeFile.mutationOptions({ onSuccess: refresh }));
  return { add, remove };
}

export function usePaymentQrChanges(packageId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const refresh = useRefreshFiles(packageId);
  const add = useMutation({
    mutationFn: async (file: File) => {
      const slot = await client.packages.requestPaymentQrUpload.mutate({
        packageId,
        fileName: file.name,
        contentType: file.type as never,
        sizeBytes: file.size,
      });
      await uploadFile(slot.upload, file);
      await client.packages.confirmPaymentQr.mutate({ packageId, attachmentId: slot.attachmentId });
    },
    onSettled: refresh,
  });
  const remove = useMutation(trpc.packages.removePaymentQr.mutationOptions({ onSuccess: refresh }));
  return { add, remove };
}
