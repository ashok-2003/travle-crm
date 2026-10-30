"use client";

// Suppliers' reads and changes (release 7a): the list a page at a time, one supplier, what the agency owes, and every change.
// A change to a supplier loads again its pages and the dues; marking a cost paid is finance's, and loads the dues too.
import type { ListSuppliersInput } from "@travel-crm/contracts/suppliers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";

export function useSupplierList(filter: Omit<ListSuppliersInput, "cursor">) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  return useCursorPages({
    queryKey: [...trpc.suppliers.list.pathKey(), filter],
    page: (cursor) => client.suppliers.list.query({ ...filter, ...(cursor === null ? {} : { cursor }) }),
    items: (page) => page.items,
  });
}

export function useSupplier(supplierId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.suppliers.get.queryOptions({ supplierId }));
}

export function useDues() {
  const trpc = useTRPC();
  return useQuery(trpc.suppliers.dues.queryOptions());
}

export function useSupplierChanges() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const options = {
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.suppliers.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.finance.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.departures.pathKey() }),
      ]),
  };
  return {
    create: useMutation(trpc.suppliers.create.mutationOptions(options)),
    update: useMutation(trpc.suppliers.update.mutationOptions(options)),
    remove: useMutation(trpc.suppliers.delete.mutationOptions(options)),
    saveContact: useMutation(trpc.suppliers.saveContact.mutationOptions(options)),
    removeContact: useMutation(trpc.suppliers.removeContact.mutationOptions(options)),
    linkCosts: useMutation(trpc.suppliers.linkCosts.mutationOptions(options)),
  };
}
