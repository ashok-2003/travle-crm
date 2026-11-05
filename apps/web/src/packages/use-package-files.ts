"use client";

// A package's brochures and payment QR (group packages): the list, and adding (three steps: ask where to put the file, put
// it straight into storage, name it) and removing one. Every change loads the files again.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PackageFileKind } from "@travel-crm/contracts/quotes";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";

export function usePackageFiles(packageId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.packages.files.queryOptions({ packageId }));
}

export function usePackageFileChanges(packageId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.packages.files.queryKey({ packageId }) });
  const add = useMutation({
    mutationFn: async ({ kind, file }: { kind: PackageFileKind; file: File }) => {
      const slot = await client.packages.requestFileUpload.mutate({
        packageId,
        kind,
        fileName: file.name,
        contentType: file.type as never,
        sizeBytes: file.size,
      });
      await uploadFile(slot.upload, file);
      await client.packages.confirmFile.mutate({ packageId, kind, attachmentId: slot.attachmentId });
    },
    onSettled: refresh,
  });
  const remove = useMutation(trpc.packages.removeFile.mutationOptions({ onSuccess: refresh }));
  return { add, remove };
}
