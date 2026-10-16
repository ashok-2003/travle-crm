"use client";

// The business profile's calls. The profile holds the bank account, so it is never kept in the device's saved copy
// (IndexedDB) and is asked for whenever the screen opens. Saving puts the profile the api kept (GSTIN and IFSC in
// capitals, the phone in E.164) in the cache at once, so the form shows it, and asks for the setup checklist again,
// whose steps follow the profile.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";

export function useProfile() {
  const trpc = useTRPC();
  return useQuery(trpc.organization.profile.get.queryOptions(undefined, { meta: { persist: false } }));
}

export function useSaveProfile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("business.profile");
  return useMutation(
    trpc.organization.profile.update.mutationOptions({
      onSuccess: async (saved) => {
        // Into the screen's own query, made with useProfile's meta, so the copy stays out of IndexedDB.
        queryClient.setQueryData(trpc.organization.profile.get.queryKey(), saved);
        toast.success(t("saved"));
        await queryClient.invalidateQueries({ queryKey: trpc.organization.setup.get.queryKey() });
      },
    }),
  );
}
