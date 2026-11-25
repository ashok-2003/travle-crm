"use client";

// The dialogs a price-table column's menu opens: change its dates, rename it, or remove it (after asking). The column a
// dialog is about is kept by the table after the dialog closes, so it can finish closing.
import type { RoomType, SeasonColumn } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { ChangeDatesDialog } from "./change-dates-dialog";
import { RenameSeasonDialog } from "./rename-season-dialog";
import type { ColumnAction } from "./season-column-menu";
import { usePackageColumnChanges } from "./use-packages";

export function SeasonColumnDialogs({
  packageId,
  roomTypes,
  column,
  action,
  onClose,
  returnFocusTo,
}: {
  packageId: string;
  /** The room types the trip sells, which a rename's save carries. */
  roomTypes: readonly RoomType[];
  column: SeasonColumn;
  action: ColumnAction | null;
  onClose: () => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("packages.prices");
  const { removeColumn } = usePackageColumnChanges();
  const held = (own: ColumnAction) => ({
    open: action === own,
    setOpen: (open: boolean) => {
      if (!open) onClose();
    },
  });
  return (
    <>
      <ChangeDatesDialog packageId={packageId} column={column} held={held("dates")} returnFocusTo={returnFocusTo} />
      <RenameSeasonDialog
        packageId={packageId}
        roomTypes={roomTypes}
        column={column}
        held={held("rename")}
        returnFocusTo={returnFocusTo}
      />
      <ConfirmDialog
        open={action === "remove"}
        onOpenChange={held("remove").setOpen}
        title={t("removeTitle", { season: column.label })}
        description={t("removeDescription")}
        action={t("remove")}
        request={removeColumn}
        returnFocusTo={returnFocusTo}
        onConfirm={() => {
          removeColumn.mutate(
            { packageId, seasonIds: column.seasonIds },
            {
              onSuccess: () => {
                toast.success(t("removed"));
                onClose();
              },
            },
          );
        }}
      />
    </>
  );
}
