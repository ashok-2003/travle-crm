"use client";

// The platform staff screen's calls, a super admin's alone. Adding someone and a new temporary password carry the
// password in their answer: both fail at once when offline rather than wait, and neither stays in the mutation cache
// after its dialog lets go of it, so the password lives only while the dialog shows it. Every change refreshes the
// list; a level change and a removal say so in a toast from the hook itself.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddedPlatformStaff, AddPlatformStaffInput } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useConsoleTRPC } from "../data/console-trpc";

const TEMPORARY_PASSWORD_MUTATION = { networkMode: "always", gcTime: 0 } as const;

export function usePlatformStaff() {
  const trpc = useConsoleTRPC();
  return useQuery(trpc.platformStaff.list.queryOptions());
}

function useRefreshStaff() {
  const trpc = useConsoleTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.platformStaff.list.queryKey() });
}

/** `onAdded` is the mutation's own, so it runs whether or not the form that asked is still on screen. */
export function useAddPlatformStaff(onAdded: (input: AddPlatformStaffInput, answer: AddedPlatformStaff) => void) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshStaff();
  return useMutation(
    trpc.platformStaff.add.mutationOptions({
      ...TEMPORARY_PASSWORD_MUTATION,
      onSuccess: (answer, input) => {
        onAdded(input, answer);
      },
      // Not awaited: the password is shown the moment the api answers, whatever the list's refresh is waiting for.
      onSettled: () => {
        void refresh();
      },
    }),
  );
}

export function useResetPlatformStaffPassword() {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshStaff();
  return useMutation(
    trpc.platformStaff.resetPassword.mutationOptions({
      ...TEMPORARY_PASSWORD_MUTATION,
      // Not awaited: the password is shown the moment the api answers, whatever the list's refresh is waiting for.
      onSettled: () => {
        void refresh();
      },
    }),
  );
}

export function useSetPlatformStaffLevel(name: string) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshStaff();
  const t = useTranslations("consolePlatform.staff.changeLevel");
  const tLevels = useTranslations("console.levels");
  return useMutation(
    trpc.platformStaff.setLevel.mutationOptions({
      onSuccess: (_answer, { level }) => {
        toast.success(t("changed", { name, level: tLevels(level) }));
      },
      onSettled: refresh,
    }),
  );
}

export function useRemovePlatformStaff(name: string) {
  const trpc = useConsoleTRPC();
  const refresh = useRefreshStaff();
  const t = useTranslations("consolePlatform.staff.remove");
  return useMutation(
    trpc.platformStaff.remove.mutationOptions({
      onSuccess: () => {
        toast.success(t("removed", { name }));
      },
      onSettled: refresh,
    }),
  );
}
