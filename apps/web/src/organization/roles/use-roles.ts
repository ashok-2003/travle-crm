"use client";

// The roles screens' calls. A change to a role refreshes the roles list, and the staff list, which shows role names.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

function useRefreshRoles() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.roles.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.staff.list.queryKey() }),
    ]);
  };
}

export function useCreateRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  return useMutation(trpc.roles.create.mutationOptions({ onSettled: refresh }));
}

export function useUpdateRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  return useMutation(trpc.roles.update.mutationOptions({ onSettled: refresh }));
}

export function useDeleteRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  return useMutation(trpc.roles.delete.mutationOptions({ onSettled: refresh }));
}
