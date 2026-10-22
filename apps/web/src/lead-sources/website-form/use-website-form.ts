"use client";

// The website form as its screens follow it: websiteForm.get asked again whenever a screen opens (the copy kept for
// offline use can predate a change), and the changes that answer with the page's new view, which replaces the cached one
// so the page and the Lead sources row move together.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WebsiteFormView } from "@travel-crm/contracts/website-forms";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";

export function useWebsiteFormView() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.websiteForm.get.queryOptions(), refetchOnMount: "always" });
}

export function useWebsiteForm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("websiteFormSettings.save");
  const view = useWebsiteFormView();
  const keep = (next: WebsiteFormView) => {
    queryClient.setQueryData(trpc.websiteForm.get.queryKey(), next);
  };
  const turnOn = useMutation(trpc.websiteForm.turnOn.mutationOptions({ onSuccess: keep }));
  const turnOff = useMutation(trpc.websiteForm.turnOff.mutationOptions({ onSuccess: keep }));
  const save = useMutation(
    trpc.websiteForm.save.mutationOptions({
      onSuccess: (next) => {
        keep(next);
        toast.success(t("saved"));
      },
    }),
  );
  return { view, turnOn, turnOff, save };
}

/** Change the link: the new view replaces the cached one and `onChanged` closes the question that asked, however it is by then. */
export function useChangeLink(onChanged: () => void) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return useMutation(
    trpc.websiteForm.changeLink.mutationOptions({
      onSuccess: (next) => {
        queryClient.setQueryData(trpc.websiteForm.get.queryKey(), next);
        onChanged();
      },
    }),
  );
}
