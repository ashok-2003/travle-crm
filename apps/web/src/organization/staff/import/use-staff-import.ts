"use client";

// The staff import's calls (spec 3.4, B46): the import's page, asked again every 2 seconds while the worker works on it;
// the columns' match; Add, which makes the temporary passwords here, sends them 25 at a time and then presses Add; and
// cancelling. The passwords are in no call's variables: Add's variables are the rows, and the passwords are read from
// the memory-only store (password-store.ts), so they never reach the mutation cache, which is persisted offline.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MAX_PASSWORDS_PER_CALL,
  type StaffImportedPerson,
  type StaffImportSeats,
} from "@travel-crm/contracts/identity";
import type { ImportDetail } from "@travel-crm/contracts/imports";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { importRefetchInterval } from "@/imports/import-refetch";
import { temporaryPassword } from "../temporary-password";
import { passwordStore } from "./password-store";

/** A staff import's page: any import's, and the seats free and the people it added. */
export type StaffImportPage = ImportDetail & { seats: StaffImportSeats; added: StaffImportedPerson[] };

export function useStaffImport(importId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.staffImports.get.queryOptions(
      { importId },
      { refetchInterval: (query) => importRefetchInterval(query.state.data) },
    ),
  );
}

/** The import's page asked for again, and Recent imports with it. Not waited for: the call is over when it is answered. */
function useRefreshImport(importId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.staffImports.get.queryKey({ importId }) }),
      queryClient.invalidateQueries({ queryKey: trpc.staffImports.recent.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.staffImports.rows.queryKey() }),
    ]);
  };
}

export function useMatchStaffColumns(importId: string) {
  const trpc = useTRPC();
  const refresh = useRefreshImport(importId);
  return useMutation(trpc.staffImports.match.mutationOptions({ onSettled: refresh }));
}

export function useCancelStaffImport(importId: string, onCancelled: () => void) {
  const trpc = useTRPC();
  const refresh = useRefreshImport(importId);
  return useMutation(trpc.staffImports.cancel.mutationOptions({ onSuccess: onCancelled, onSettled: refresh }));
}

/**
 * Add: a password for each row to add, made here and kept in memory, sent 25 at a time, then Add itself. A try that
 * fails at any point forgets them: the next press makes new ones. `onAdded` is the confirmation dialog's close.
 */
export function useAddStaffImport(importId: string, onAdded: () => void) {
  const client = useTRPCClient();
  const refresh = useRefreshImport(importId);
  return useMutation({
    // Fails at once offline instead of waiting, and is let go of the moment it settles.
    networkMode: "always",
    gcTime: 0,
    mutationFn: async (rowNumbers: readonly number[]) => {
      passwordStore.keep(importId, new Map(rowNumbers.map((rowNumber) => [rowNumber, temporaryPassword()])));
      const made = [...(passwordStore.get(importId) ?? [])];
      for (let start = 0; start < made.length; start += MAX_PASSWORDS_PER_CALL) {
        const batch = made.slice(start, start + MAX_PASSWORDS_PER_CALL);
        await client.staffImports.setPasswords.mutate({
          importId,
          passwords: batch.map(([rowNumber, password]) => ({ rowNumber, password })),
        });
      }
      await client.staffImports.add.mutate({ importId });
    },
    onSuccess: onAdded,
    onError: () => {
      passwordStore.forget(importId);
    },
    onSettled: refresh,
  });
}
