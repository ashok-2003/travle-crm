"use client";

// The business profile's calls. Saving puts the profile the api kept (GSTIN and IFSC in capitals, the phone in E.164)
// in the cache at once, so the form shows it, and asks for the setup checklist again, whose steps follow the profile.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";

export function useProfile() {
  const trpc = useTRPC();
  return useQuery(trpc.organization.profile.get.queryOptions());
}

export function useSaveProfile() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("business.profile");
  return useMutation(
    trpc.organization.profile.update.mutationOptions({
      onSuccess: async (saved) => {
        queryClient.setQueryData(trpc.organization.profile.get.queryKey(), saved);
        toast.success(t("saved"));
        await queryClient.invalidateQueries({ queryKey: trpc.organization.setup.get.queryKey() });
      },
    }),
  );
}
