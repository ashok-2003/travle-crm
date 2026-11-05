"use client";

// A package's reads and changes (release 7b): the package for its editor, its tiers, its photos (three steps: ask where to put
// the file, put it straight into storage, name it), the "From" helper, and making quotes from it. A change loads the package
// again, and the lists of packages.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";
import { useRefreshWork } from "@/data/use-refresh-work";

export function usePackage(packageId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.packages.get.queryOptions({ packageId }));
}

export function usePackagePhotos(packageId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.packages.photos.queryOptions({ packageId }));
}

export function usePackageChanges() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = {
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() }),
      ]),
  };
  return {
    update: useMutation(trpc.packages.update.mutationOptions(options)),
    setPublished: useMutation(trpc.packages.setPublished.mutationOptions(options)),
    setSellable: useMutation(trpc.packages.setSellable.mutationOptions(options)),
    saveTier: useMutation(trpc.packages.saveTier.mutationOptions(options)),
    removeTier: useMutation(trpc.packages.removeTier.mutationOptions(options)),
  };
}

/** The helper beside "From ₹X": asked on a tap, never kept. */
export function useCalculateFrom() {
  const client = useTRPCClient();
  return useMutation({ mutationFn: (packageId: string) => client.packages.calculateFrom.query({ packageId }) });
}

/** Adds photos one after another, and removes one. */
export function usePackagePhotoChanges(packageId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() });
  const add = useMutation({
    mutationFn: async (files: readonly File[]) => {
      for (const file of files) {
        const slot = await client.packages.requestPhotoUpload.mutate({
          packageId,
          fileName: file.name,
          contentType: file.type as never,
          sizeBytes: file.size,
        });
        await uploadFile(slot.upload, file);
        await client.packages.confirmPhoto.mutate({ packageId, attachmentId: slot.attachmentId });
      }
    },
    // A photo that failed halfway leaves the ones before it added: the list shows them.
    onSettled: refresh,
  });
  const remove = useMutation(trpc.packages.removePhoto.mutationOptions({ onSuccess: refresh }));
  return { add, remove };
}

/** Quotes for the tiers chosen: they and the lead's work load again. */
export function useMakeQuotes() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  return useMutation(
    trpc.packages.makeQuotes.mutationOptions({
      onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }), refreshWork()]),
    }),
  );
}
