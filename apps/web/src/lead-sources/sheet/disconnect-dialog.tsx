"use client";

// Disconnect (S42): asks once, naming what stays and what stops. It is taking access away, so it stays open while the
// subscription is read-only; the sheet leaves the list and the person goes back to it.
import { useMutation } from "@tanstack/react-query";
import type { SheetDetail } from "@travel-crm/contracts/sheets";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useRefreshLeadSheets } from "../use-lead-sheets";

export function DisconnectDialog({
  detail,
  open,
  onOpenChange,
  returnFocusTo,
}: {
  detail: SheetDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo?: ReturnFocusTo;
}) {
  const t = useTranslations("sheets.sheet.disconnectDialog");
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshLeadSheets();
  const disconnect = useMutation(
    trpc.leadSheets.disconnect.mutationOptions({
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
      title={t("title", { sheet: detail.sheetTitle })}
      description={t.rich("description", {
        address: detail.serviceAccountEmail,
        // The address breaks anywhere when it must, never at its hyphen alone.
        email: (chunks) => <span className="numbers break-all">{chunks}</span>,
      })}
      action={t("action")}
      request={disconnect}
      onConfirm={() => {
        disconnect.mutate({ sheetId: detail.id });
      }}
    />
  );
}
