"use client";

// Changing the logo (spec 9.2): the api says where to upload, the browser PUTs the file straight to storage with its
// progress, and the confirmed logo, with its link, replaces the one shown; or it is removed.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MAX_LOGO_BYTES } from "@travel-crm/contracts/profile";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { formatFileSize } from "@/files/file-size";
import { UploadError, uploadFile } from "@/files/upload";
import { useErrorMessage } from "@/lib/error-message";
import { logoUploadOf } from "./logo-file";

export type LogoUploadState =
  { phase: "idle" } | { phase: "uploading"; progress: number } | { phase: "failed"; message: string };

export function useLogoUpload() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("documents.branding.logo");
  const { apiError } = useErrorMessage();
  const requestUpload = useMutation(trpc.organization.logo.requestUpload.mutationOptions());
  const confirmUpload = useMutation(trpc.organization.logo.confirmUpload.mutationOptions());
  const [state, setState] = useState<LogoUploadState>({ phase: "idle" });

  const start = async (file: File): Promise<void> => {
    const checked = logoUploadOf(file);
    if (!checked.ok) {
      setState({ phase: "failed", message: t(checked.problem, { size: formatFileSize(MAX_LOGO_BYTES) }) });
      return;
    }
    setState({ phase: "uploading", progress: 0 });
    try {
      const { attachmentId, upload } = await requestUpload.mutateAsync(checked.input);
      await uploadFile(upload, file, {
        onProgress: (progress) => {
          setState({ phase: "uploading", progress });
        },
      });
      const logo = await confirmUpload.mutateAsync({ attachmentId });
      queryClient.setQueryData(trpc.organization.logo.get.queryKey(), logo);
      setState({ phase: "idle" });
      toast.success(t("saved"));
    } catch (error) {
      setState({ phase: "failed", message: error instanceof UploadError ? t("uploadFailed") : apiError(error) });
    }
  };

  return { state, start };
}

export function useRemoveLogo() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("documents.branding.logo");
  return useMutation(
    trpc.organization.logo.remove.mutationOptions({
      onSuccess: () => {
        toast.success(t("removed"));
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.organization.logo.get.queryKey() }),
    }),
  );
}
