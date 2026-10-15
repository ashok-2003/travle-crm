"use client";

// The roles screens' calls. A change to a role refreshes the roles list, and the staff list, which shows role names.
// The toasts and the moves to another page are in the hooks' own callbacks, so they don't depend on the calling
// component still being mounted (a deleted role's editor, a re-keyed one).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTRPC } from "@/data/trpc";
import { useErrorMessage } from "@/lib/error-message";
import { routes } from "@/lib/routes";

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

export function useDeleteRole(name: string) {
  const trpc = useTRPC();
  const refresh = useRefreshRoles();
  const router = useRouter();
  const t = useTranslations("roles.delete");
  const { apiError } = useErrorMessage();
  return useMutation(
    trpc.roles.delete.mutationOptions({
      onSuccess: () => {
        toast.success(t("deleted", { name }));
        router.push(routes.roles);
      },
      onError: (error) => {
        toast.error(apiError(error), { duration: Infinity });
      },
      onSettled: refresh,
    }),
  );
}
