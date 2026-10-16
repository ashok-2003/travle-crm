// The organization page's change dialogs: a FormDialog (components/forms/form-dialog.tsx) whose success loads the
// organization's page and the dashboard again, then says `done`.
import { useQueryClient } from "@tanstack/react-query";
import { useFormDialog } from "@/components/forms/form-dialog";
import { useConsoleTRPC } from "../data/console-trpc";

export function useChangeDialog(organizationId: string, done: string) {
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  return useFormDialog(done, () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.organizations.get.queryKey({ organizationId }) }),
      queryClient.invalidateQueries({ queryKey: trpc.dashboard.organizations.pathKey() }),
    ]),
  );
}
