"use client";

// The roles screens' calls. A change to a role refreshes the roles list, the staff list, which shows role names, and
// the people who may own a lead (the owner pickers), as a role's permissions decide who works leads. The toasts and
// the moves to another page are in the hooks' own callbacks, so they don't depend on the calling component still
// being mounted (a deleted role's editor, a re-keyed one).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";

function useRefreshRoles() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.roles.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.staff.list.queryKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.leads.owners.queryKey() }),
    ]);
  };
}

export function useCreateRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  const router = useRouter();
  return useMutation(
    trpc.roles.create.mutationOptions({
      onSuccess: (role) => {
        router.push(`${routes.roles}/${role.key}`);
      },
      onSettled: refresh,
    }),
  );
}

export function useUpdateRole() {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  const t = useTranslations("roles.editor");
  return useMutation(
    trpc.roles.update.mutationOptions({
      onSuccess: (saved) => {
        toast.success(t("saved", { name: saved.name }));
      },
      onSettled: refresh,
    }),
  );
}

/** Deleting a role; `onDeleted` closes the dialog that asked, however it ends (ConfirmDialog's contract). */
export function useDeleteRole(name: string, onDeleted: () => void) {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  const router = useRouter();
  const t = useTranslations("roles.delete");
  return useMutation(
    trpc.roles.delete.mutationOptions({
      onSuccess: () => {
        onDeleted();
        toast.success(t("deleted", { name }));
        router.push(routes.roles);
      },
      // A refusal shows in the dialog (components/confirm-dialog.tsx).
      onSettled: refresh,
    }),
  );
}
