"use client";

// An organization's exports (dataProtection.exports), asked again every two seconds while one is being prepared by
// the console's job, for ten minutes at most; asking for one, which refreshes them and says so in a toast; and a done one's download links.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useErrorMessage } from "@/lib/error-message";
import { useConsoleTRPC } from "../data/console-trpc";

const WHILE_PREPARED_MS = 2000;
/** An export still `requested` this long after it was asked for has probably failed, and is no longer waited for. */
const GIVE_UP_MS = 10 * 60 * 1000;

export function useExports(organizationId: string) {
  const trpc = useConsoleTRPC();
  return useQuery({
    ...trpc.dataProtection.exports.queryOptions({ organizationId }),
    refetchInterval: (query) =>
      query.state.data?.some(
        (entry) => entry.state === "requested" && Date.now() - Date.parse(entry.requestedAt) < GIVE_UP_MS,
      )
        ? WHILE_PREPARED_MS
        : false,
  });
}

export function useExportOrganization() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  const { apiError } = useErrorMessage();
  const t = useTranslations("consolePlatform.dataProtection.exports");
  return useMutation(
    trpc.dataProtection.exportOrganization.mutationOptions({
      onSuccess: () => {
        toast.success(t("asked"));
      },
      onError: (error) => {
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.dataProtection.exports.pathKey() }),
    }),
  );
}

/** A mutation, as the api's is: each download is logged. */
export function useDownloadExport() {
  const trpc = useConsoleTRPC();
  return useMutation(trpc.dataProtection.downloadExport.mutationOptions());
}
