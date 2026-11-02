"use client";

// /suppliers/dues (release 7a): what the agency owes, for whoever sees the accounts: unpaid supplier costs grouped by
// supplier, the overdue ones first and in red, with the total owed to each. "Mark paid" is finance's, the same as on a booking.
import { CheckIcon, HandshakeIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/bookings/section-card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { rupees } from "@/components/forms/money-field";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { BackLink, TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { useFinanceChanges, useToday } from "@/finance/use-finance";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute, quoteRoute, routes, supplierRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useDues } from "./use-suppliers";

export function DuesScreen() {
  const t = useTranslations("suppliers.dues");
  const tCategory = useTranslations("finance.costForm.categories");
  const tCommon = useTranslations("common");
  const dues = useDues();
  const mayEdit = useHolds("accounts:edit");
  const { markCostPaid } = useFinanceChanges();
  const today = useToday();
  const body = () => {
    if (dues.data === undefined) {
      return dues.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={dues.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void dues.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    const data = dues.data;
    if (data.groups.length === 0) return <EmptyState icon={HandshakeIcon} message={t("empty")} />;
    return (
      <>
        <dl className="grid max-w-md grid-cols-2 gap-3">
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t("total")}</dt>
            <dd className="numbers text-section font-semibold">{rupees(data.totalPaise)}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-caption text-muted-foreground">{t("overdue")}</dt>
            <dd className={`numbers text-section font-semibold ${data.overduePaise > 0 ? "text-status-bad-ink" : ""}`}>
              {rupees(data.overduePaise)}
            </dd>
          </div>
        </dl>
        <RefusalAlert error={markCostPaid.error} />
        {data.groups.map((group) => (
          <SectionCard key={group.supplierId ?? group.name} title={group.name}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="numbers font-semibold">{t("owed", { amount: rupees(group.owedPaise) })}</span>
              {group.overduePaise > 0 && (
                <StatusBadge tone="bad">{t("overdueOf", { amount: rupees(group.overduePaise) })}</StatusBadge>
              )}
              {group.supplierId === null ? (
                <span className="text-caption text-muted-foreground">{t("notLinked")}</span>
              ) : (
                <TextLink inline href={supplierRoute(group.supplierId)}>
                  {group.name}
                </TextLink>
              )}
            </p>
            <ItemGroup>
              {group.items.map((item) => (
                <Item key={item.id} size="sm" role="listitem" className="items-start">
                  <ItemContent className="min-w-0">
                    <ItemTitle>
                      {item.quoteId !== null ? (
                        <TextLink inline href={quoteRoute(item.quoteId)}>
                          {item.forTitle}
                        </TextLink>
                      ) : item.departureId !== null ? (
                        <TextLink inline href={departureRoute(item.departureId)}>
                          {item.forTitle}
                        </TextLink>
                      ) : (
                        item.forTitle
                      )}
                    </ItemTitle>
                    <ItemDescription className="flex flex-wrap items-center gap-2">
                      <span>{[tCategory(item.category), item.note].filter((part) => part !== "").join(" · ")}</span>
                      {item.overdue ? (
                        <StatusBadge tone="bad">
                          {t("overdueTag")}: {formatCalendarDay(item.dueOn ?? today)}
                        </StatusBadge>
                      ) : (
                        <span>
                          {item.dueOn === null ? t("noDate") : t("dueOn", { day: formatCalendarDay(item.dueOn) })}
                        </span>
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span className="numbers">{rupees(item.amountPaise)}</span>
                    {mayEdit && (
                      <Button
                        variant="outline"
                        aria-label={t("markPaidFor", { supplier: group.name })}
                        disabled={markCostPaid.isPending}
                        onClick={() => {
                          markCostPaid.mutate(
                            { tripCostId: item.id, paidOn: today },
                            { onSuccess: () => void dues.refetch() },
                          );
                        }}
                      >
                        <CheckIcon aria-hidden="true" />
                        {t("markPaid")}
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </SectionCard>
        ))}
      </>
    );
  };
  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <BackLink href={routes.suppliers} label={t("back")} />
      <PageHeader title={t("title")} intro={t("intro")} />
      {body()}
    </div>
  );
}
