"use client";

// Changing the logo (spec 9.2): sent straight to storage like any file (useSignedUpload: progress, Stop, failing at
// once offline, Try again picking up where it stopped), then the confirmed logo, with its link, replaces the one shown;
// or it is removed. Either way the setup checklist, whose logo step it ticks, is asked again.
import type { RequestLogoUploadInput } from "@travel-crm/contracts/profile";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useSignedUpload } from "@/files/use-signed-upload";

/** A logo to send: the file, and what the api is asked to sign for it (logoUploadOf). */
export interface LogoRequest {
  file: File;
  input: RequestLogoUploadInput;
}

export function useLogoUpload() {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const t = useTranslations("documents.branding.logo");
  return useSignedUpload({
    requestUpload: ({ input }: LogoRequest) => client.organization.logo.requestUpload.mutate(input),
    confirmUpload: (attachmentId) => client.organization.logo.confirmUpload.mutate({ attachmentId }),
    onSuccess: (logo) => {
      const key = trpc.organization.logo.get.queryKey();
      // Its link lasts five minutes: setQueryData carries no meta, so should the panel's query be gone by now, the
      // one it makes takes persist: false from the key's defaults and stays out of IndexedDB.
      queryClient.setQueryDefaults(key, { meta: { persist: false } });
      queryClient.setQueryData(key, logo);
      void queryClient.invalidateQueries({ queryKey: trpc.organization.setup.get.queryKey() });
      toast.success(t("saved"));
    },
  });
}

/** Removing the logo; `onRemoved` closes the dialog that asked, however it is by then. */
export function useRemoveLogo(onRemoved: () => void) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("documents.branding.logo");
  return useMutation(
    trpc.organization.logo.remove.mutationOptions({
      onSuccess: () => {
        toast.success(t("removed"));
        onRemoved();
      },
      onSettled: () =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.organization.logo.get.queryKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.organization.setup.get.queryKey() }),
        ]),
    }),
  );
}
