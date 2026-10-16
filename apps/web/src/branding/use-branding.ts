"use client";

// Saving the colour and terms (organization.branding.update): the saved branding replaces the cached one, and the
// setup checklist, whose branding step it ticks, is asked again.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";

export function useSaveBranding() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("documents.branding.details");
  return useMutation(
    trpc.organization.branding.update.mutationOptions({
      onSuccess: (saved) => {
        queryClient.setQueryData(trpc.organization.branding.get.queryKey(), saved);
        toast.success(t("saved"));
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.organization.setup.get.queryKey() }),
    }),
  );
}
