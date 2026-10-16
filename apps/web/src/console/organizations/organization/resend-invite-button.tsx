"use client";

// A new invite for a member who hasn't chosen a password yet (organizations.resendInvite: the first Owner, until they
// do). The worker emails it; earlier links keep working until they lapse. A refusal (they have chosen one meanwhile,
// the hour's cap) says why.
import type { OrganizationMember } from "@travel-crm/contracts/platform";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useErrorMessage } from "@/lib/error-message";
import { useConsoleTRPC } from "../../data/console-trpc";

export function ResendInviteButton({ organizationId, member }: { organizationId: string; member: OrganizationMember }) {
  const t = useTranslations("consoleOrganizations.members");
  const { apiError } = useErrorMessage();
  const queryClient = useQueryClient();
  const trpc = useConsoleTRPC();
  const resend = useMutation(
    trpc.organizations.resendInvite.mutationOptions({
      onSuccess: () => {
        toast.success(t("inviteSent", { email: member.email ?? "" }));
      },
      onError: async (error) => {
        toast.error(apiError(error));
        // A password chosen since the list loaded: the list says so once it loads again.
        await queryClient.invalidateQueries({ queryKey: trpc.organizations.members.queryKey({ organizationId }) });
      },
    }),
  );
  return (
    <Button
      variant="outline"
      disabled={resend.isPending}
      onClick={() => {
        resend.mutate({ organizationId, memberId: member.memberId });
      }}
    >
      {resend.isPending && <Spinner />}
      {resend.isPending ? t("resending") : t("resendInvite")}
    </Button>
  );
}
