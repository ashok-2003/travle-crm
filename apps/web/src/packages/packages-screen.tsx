"use client";

// /packages: the agency's ready trips, each with what it is (a group trip and its departures ahead, a custom trip and its
// From price, or a quote's plan and price), whether its page is published and whether the AI sells it, and Delete. New
// package starts an empty one; a quote's Save as package and the AI's drafts make one too.
import type { QuotePackage } from "@travel-crm/contracts/quotes";
import { PackageIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { rupees } from "@/components/forms/money-field";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { packageRoute } from "@/lib/routes";
import { useQuoteChanges, useQuotePackages } from "@/quotes/use-quotes";
import { useHolds } from "@/session/me-context";
import { NewPackageDialog } from "./new-package-dialog";

function useSummary() {
  const t = useTranslations("packages.list");
  return (one: QuotePackage) => {
    const nights = one.nights ?? 0;
    if (one.kind === "group") return t("summaryGroup", { nights, departures: one.departuresAhead });
    if (one.tierCount > 0) return t("summaryTiers", { days: one.days, tiers: one.tierCount });
    if (one.subtotalPaise > 0) return t("summary", { days: one.days, price: rupees(one.subtotalPaise) });
    if (one.fromPricePaise !== null) return t("summaryFrom", { nights, price: rupees(one.fromPricePaise) });
    return t("summaryCustom", { nights });
  };
}

export function PackagesScreen() {
  const t = useTranslations("packages.list");
  const tCommon = useTranslations("common");
  const packages = useQuotePackages();
  const mayEdit = useHolds("quotes:edit");
  const { deletePackage } = useQuoteChanges();
  const [deleting, setDeleting] = useState<QuotePackage | null>(null);
  const summary = useSummary();
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
    return (
      <ItemGroup>
        {packages.data.map((one) => (
          <Item key={one.id} size="sm">
            <ItemContent>
              <ItemTitle>
                {mayEdit ? (
                  <TextLink inline href={packageRoute(one.id)}>
                    {one.name}
                  </TextLink>
                ) : (
                  one.name
                )}
              </ItemTitle>
              <ItemDescription className="numbers">{summary(one)}</ItemDescription>
            </ItemContent>
            {(one.published || one.aiSellable) && (
              <ItemActions>
                {one.aiSellable && <StatusBadge tone="good">{t("aiSells")}</StatusBadge>}
                {one.published && <StatusBadge tone="good">{t("published")}</StatusBadge>}
              </ItemActions>
            )}
            {mayEdit && (
              <ItemActions>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("deleteNamed", { name: one.name })}
                  onClick={() => {
                    setDeleting(one);
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </ItemActions>
            )}
          </Item>
        ))}
      </ItemGroup>
    );
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
