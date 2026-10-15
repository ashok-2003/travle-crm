"use client";

// The staff screen's calls. Each change refreshes exactly what it affects: the staff list, and the roles list whose
// member counts move with it. A role change is a quick action: the list shows the new role at once and goes back if
// the api refuses (spec 11: optimistic updates for quick actions).
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

export function useCreateStaff() {
  const trpc = useTRPC();
  const refresh = useRefreshStaff();
  return useMutation(trpc.staff.create.mutationOptions({ onSettled: refresh }));
}

export function useResetStaffPassword() {
  const trpc = useTRPC();
  return useMutation(trpc.staff.resetPassword.mutationOptions());
}

export function useRemoveStaff() {
  const trpc = useTRPC();
  const refresh = useRefreshStaff();
  return useMutation(trpc.staff.remove.mutationOptions({ onSettled: refresh }));
}

export function useChangeStaffRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const refresh = useRefreshStaff();
  const { apiError } = useErrorMessage();
  const t = useTranslations("staff.changeRole");
  const staffKey = trpc.staff.list.queryKey();
  return useMutation(
    trpc.staff.updateRole.mutationOptions({
      onMutate: async ({ memberId, roleKey }) => {
        // Stop a refresh in flight from overwriting the new role with the old one.
        await queryClient.cancelQueries({ queryKey: staffKey });
        const before = queryClient.getQueryData<StaffMember[]>(staffKey);
        const role = queryClient.getQueryData(trpc.roles.list.queryKey())?.find((entry) => entry.key === roleKey);
        if (before && role) {
          queryClient.setQueryData(staffKey, withRole(before, memberId, { key: role.key, name: role.name }));
        }
        return { before };
      },
      onSuccess: (member) => {
        toast.success(t("changed", { name: member.name, role: member.role.name }));
      },
      onError: (error, _variables, onMutateResult) => {
        if (onMutateResult?.before) queryClient.setQueryData(staffKey, onMutateResult.before);
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: refresh,
    }),
  );
}
