"use client";

// The staff screen's calls. Each change refreshes exactly what it affects: the staff list, and the roles list whose
// member counts move with it. A role change is a quick action: the list shows the new role at once and goes back if
// the api refuses (spec 11: optimistic updates for quick actions). Toasts live in the hooks' own callbacks, not in
// the callers' mutate() options, so they don't depend on the calling component still being mounted.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { StaffMember } from "@travel-crm/contracts/identity";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { withRole } from "./staff-details";

function useRefreshStaff() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.staff.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.roles.list.queryKey() }),
    ]);
  };
}

// The two mutations that carry a temporary password in their variables. Both fail at once when offline instead of
// pausing (a paused mutation is what the query cache would persist to IndexedDB), and neither stays in the mutation
// cache after its dialog lets go of it, so the password lives only as long as the dialog needs it.
const TEMPORARY_PASSWORD_MUTATION = { networkMode: "always", gcTime: 0 } as const;

export function useCreateStaff() {
  const trpc = useTRPC();
  const refresh = useRefreshStaff();
  return useMutation(trpc.staff.create.mutationOptions({ ...TEMPORARY_PASSWORD_MUTATION, onSettled: refresh }));
}

export function useResetStaffPassword() {
  const trpc = useTRPC();
  return useMutation(trpc.staff.resetPassword.mutationOptions(TEMPORARY_PASSWORD_MUTATION));
}

export function useRemoveStaff(name: string) {
  const trpc = useTRPC();
  const refresh = useRefreshStaff();
  const t = useTranslations("staff.remove");
  return useMutation(
    trpc.staff.remove.mutationOptions({
      onSuccess: () => {
        toast.success(t("removed", { name }));
      },
      // A refusal shows in the dialog (components/confirm-dialog.tsx).
      onSettled: refresh,
    }),
  );
}

export function useChangeStaffRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshStaff();
  const { apiError } = useErrorMessage();
  const t = useTranslations("staff.changeRole");
  const staffKey = trpc.staff.list.queryKey();
  const mutationKey = trpc.staff.updateRole.mutationKey();
  return useMutation(
    trpc.staff.updateRole.mutationOptions({
      onMutate: async ({ memberId, roleKey }) => {
        // Stop a refresh in flight from overwriting the new role with the old one.
        await queryClient.cancelQueries({ queryKey: staffKey });
        const list = queryClient.getQueryData<StaffMember[]>(staffKey);
        const role = queryClient.getQueryData(trpc.roles.list.queryKey())?.find((entry) => entry.key === roleKey);
        const previous = list?.find((member) => member.memberId === memberId)?.role;
        if (list && role) {
          queryClient.setQueryData(staffKey, withRole(list, memberId, { key: role.key, name: role.name }));
        }
        return { previous };
      },
      onSuccess: (member) => {
        toast.success(t("changed", { name: member.name, role: member.role.name }));
      },
      onError: (error, { memberId, roleKey }, onMutateResult) => {
        // Give back this row only, and only while it still shows what this change wrote: restoring a snapshot of the
        // whole list would wipe a newer change to another row, and a newer change to this one is its to settle.
        const list = queryClient.getQueryData<StaffMember[]>(staffKey);
        const shown = list?.find((member) => member.memberId === memberId)?.role;
        if (list && onMutateResult?.previous && shown?.key === roleKey) {
          queryClient.setQueryData(staffKey, withRole(list, memberId, onMutateResult.previous));
        }
        toast.error(apiError(error), { duration: Infinity });
      },
      // Refresh only after the last change in flight (this one is still counted until it settles): an earlier refresh
      // would show the old role of a row whose change hasn't been answered yet.
      onSettled: async () => {
        if (queryClient.isMutating({ mutationKey }) === 1) await refresh();
      },
    }),
  );
}
