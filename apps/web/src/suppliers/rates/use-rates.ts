"use client";

// A supplier's rates (release 7b): its seasons with their rates, and every change to them. Rates are money, so only whoever
// edits suppliers or may see margins is asked; a change loads the catalog again.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSupplierRates(supplierId: string, enabled: boolean) {
  const trpc = useTRPC();
  return useQuery({ ...trpc.suppliers.rates.queryOptions({ supplierId }), enabled });
}

export function useRateChanges() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = { onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.suppliers.rates.pathKey() }) };
  return {
    saveSeason: useMutation(trpc.suppliers.saveSeason.mutationOptions(options)),
    deleteSeason: useMutation(trpc.suppliers.deleteSeason.mutationOptions(options)),
    copySeason: useMutation(trpc.suppliers.copySeason.mutationOptions(options)),
    saveRate: useMutation(trpc.suppliers.saveRate.mutationOptions(options)),
    deleteRate: useMutation(trpc.suppliers.deleteRate.mutationOptions(options)),
  };
}
