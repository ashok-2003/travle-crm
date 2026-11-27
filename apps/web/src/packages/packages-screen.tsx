"use client";

// /packages: the agency's ready trips, a table on a wide screen and a row each on a phone, with each trip's From price,
// its next departure and seats, and the badges for what needs attention (the AI cannot sell it, or it is off, or a group
// trip has no departure ahead); its row menu deletes it. New package starts an empty one; a quote's Save as
// package and the AI's drafts make one too.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { PackageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type RefObject } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useQuoteChanges, useQuotePackages } from "@/quotes/use-quotes";
import { useHolds } from "@/session/me-context";
import { NewPackageDialog } from "./new-package-dialog";
import { PackagesRows } from "./packages-rows";
import { PackagesTable } from "./packages-table";

export function PackagesScreen() {
  const t = useTranslations("packages.list");
  const tCommon = useTranslations("common");
  const packages = useQuotePackages();
  const mayEdit = useHolds("quotes:edit");
  const { deletePackage } = useQuoteChanges();
  const wide = useWideScreen();
  const [deleting, setDeleting] = useState<QuotePackage | null>(null);
  // Kept after the dialog closes: Radix gives the focus back once it has, and the ref must still be there.
  const [openedBy, setOpenedBy] = useState<RefObject<HTMLButtonElement | null>>();
  const body = () => {
    if (packages.data === undefined) {
      return packages.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={packages.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void packages.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (packages.data.length === 0) return <EmptyState icon={PackageIcon} message={t("none")} />;
    const list = {
      packages: packages.data,
      mayEdit,
      onDelete: (one: QuotePackage, returnTo: RefObject<HTMLButtonElement | null>) => {
        setOpenedBy(returnTo);
        setDeleting(one);
      },
    };
    return wide ? <PackagesTable {...list} /> : <PackagesRows {...list} />;
  };
  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <PageHeader title={t("title")} intro={t("intro")} action={mayEdit && <NewPackageDialog />} />
      {body()}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteDescription")}
        action={t("delete")}
        returnFocusTo={openedBy}
        request={deletePackage}
        onConfirm={() => {
          if (deleting === null) return;
          deletePackage.mutate(
            { packageId: deleting.id },
            {
              onSuccess: () => {
                setDeleting(null);
              },
            },
          );
        }}
      />
    </div>
  );
}
