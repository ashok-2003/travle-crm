// The organization page's change dialogs: a FormDialog (components/forms/form-dialog.tsx) whose success loads the
// organization's page and the dashboard again, then says `done`. A dialog opened from the subscription's Change menu
// is given the open state the menu holds.
import { useQueryClient } from "@tanstack/react-query";
import { useFormDialog, type OpenState } from "@/components/forms/form-dialog";
import { useConsoleTRPC } from "../data/console-trpc";

export function useChangeDialog(organizationId: string, done: string, held?: OpenState) {
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  return useFormDialog(
    done,
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.organizations.get.queryKey({ organizationId }) }),
        queryClient.invalidateQueries({ queryKey: trpc.dashboard.organizations.pathKey() }),
      ]),
    held,
  );
}
