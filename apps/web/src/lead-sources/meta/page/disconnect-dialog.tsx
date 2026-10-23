"use client";

// Disconnect Page: asks once, naming what stays and what stops. It is taking access away, so it stays open while the
// subscription is read-only; the Page leaves the list and the person goes back to it.
import { useMutation } from "@tanstack/react-query";
import type { MetaPageDetail } from "@travel-crm/contracts/meta-leads";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useRefreshMeta } from "../use-meta-pages";

export function DisconnectDialog({
  detail,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  detail: MetaPageDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("metaLeads.disconnect");
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshMeta();
  const disconnect = useMutation(
    trpc.metaLeads.disconnect.mutationOptions({
      onSuccess: async () => {
        onOpenChange(false);
        router.push(routes.leadSources);
        await refresh();
      },
    }),
  );
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={t("title", { page: detail.pageName })}
      description={t("description")}
      action={t("action")}
      request={disconnect}
      onConfirm={() => {
        disconnect.mutate({ pageId: detail.id });
      }}
    />
  );
}
