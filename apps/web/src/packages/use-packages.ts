"use client";

// A package's reads and changes (release 7b): the package for its page, a section of it saved, its tiers, its photos
// (three steps: ask where to put the file, put it straight into storage, name it), the "From" helper, and making quotes
// from it. A change loads the package again, and the lists of packages.
import type { SavePackageSeasonInput } from "@travel-crm/contracts/quotes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { uploadFile } from "@/files/upload";
import { useRefreshWork } from "@/data/use-refresh-work";

export function usePackage(packageId: string, enabled = true) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.packages.get.queryOptions({ packageId }), enabled });
}

export function usePackagePhotos(packageId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.packages.photos.queryOptions({ packageId }));
}

export function usePackageChanges() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refreshWork = useRefreshWork();
  // Prices and seasons change the departures' calendar, and any change takes away the AI box's Undo all.
  const options = {
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.departures.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.ai.packageChanges.latest.pathKey() }),
      ]),
  };
  return {
    setPublished: useMutation(trpc.packages.setPublished.mutationOptions(options)),
    // A refusal means what the page showed was out of date (a payment QR removed elsewhere): read it again.
    setSellable: useMutation(
      trpc.packages.setSellable.mutationOptions({
        ...options,
        onError: () => queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
      }),
    ),
    saveTier: useMutation(trpc.packages.saveTier.mutationOptions(options)),
    removeTier: useMutation(trpc.packages.removeTier.mutationOptions(options)),
    savePriceTable: useMutation(trpc.packages.savePriceTable.mutationOptions(options)),
    // One section of the trip saved; a schedule change made or moved departures, so their lists load again, and a
    // destination named anew was added to the agency's list, so its pickers and Settings load it again.
    updatePart: useMutation(
      trpc.packages.updatePart.mutationOptions({
        onSuccess: (_saved, input) =>
          Promise.all([options.onSuccess(), input.newDestinationName === undefined ? null : refreshWork()]),
      }),
    ),
    copyNote: useMutation(trpc.packages.copyNote.mutationOptions(options)),
  };
}

/**
 * A price-table column is one or more seasons (Regular split around Christmas). Changing one season's dates is made
 * season by season; removing a column is one call (and renaming one goes through the price table's save).
 */
export function usePackageColumnChanges() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.packages.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.quotes.packages.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.departures.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.ai.packageChanges.latest.pathKey() }),
    ]);
  return {
    saveSeasons: useMutation({
      mutationFn: async (inputs: readonly SavePackageSeasonInput[]) => {
        for (const input of inputs) await client.packages.saveSeason.mutate(input);
      },
      onSettled: refresh,
    }),
    // The whole column goes in one transaction: all its seasons or none.
    removeColumn: useMutation(trpc.packages.removeSeasonColumn.mutationOptions({ onSettled: refresh })),
    addSeason: useMutation(trpc.packages.saveSpecialPrices.mutationOptions({ onSuccess: refresh })),
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
