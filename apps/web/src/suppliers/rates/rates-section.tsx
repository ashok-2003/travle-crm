"use client";

// A supplier's rates on its page (release 7b): its seasons, each with the rates it holds, for whoever edits suppliers or may see
// margins (rates are what the agency pays). Seasons and rates are changed in dialogs; "Copy to next year" repeats a season
// with every cost changed by a share.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RateSheetButton } from "@/ai/rates/rate-sheet-button";
import { SectionCard } from "@/bookings/section-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { rupees } from "@/components/forms/money-field";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCalendarDay } from "@/lib/format";
import { CopySeasonDialog } from "./copy-season-dialog";
import { RateDialog } from "./rate-dialog";
import { SeasonDialog } from "./season-dialog";
import { useRateChanges, useSupplierRates } from "./use-rates";

export function RatesSection({ supplierId, mayEdit }: { supplierId: string; mayEdit: boolean }) {
  const t = useTranslations("suppliers.rates");
  const tCommon = useTranslations("common");
  const rates = useSupplierRates(supplierId, true);
  const changes = useRateChanges();
  const [removingSeason, setRemovingSeason] = useState<{ id: string; label: string } | null>(null);
  const [removingRate, setRemovingRate] = useState<string | null>(null);
  const body = () => {
    if (rates.data === undefined) {
      return rates.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={rates.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void rates.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (rates.data.seasons.length === 0) return <p className="text-muted-foreground">{t("none")}</p>;
    return (
      <div className="flex flex-col gap-6">
        {rates.data.seasons.map((season, index) => (
          <div key={season.id} className="flex flex-col gap-3">
            {index > 0 && <Separator />}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{season.label}</h3>
                <p className="text-caption text-muted-foreground">
                  {t("range", { from: formatCalendarDay(season.startsOn), to: formatCalendarDay(season.endsOn) })}
                </p>
              </div>
              {mayEdit && (
                <div className="flex flex-wrap gap-2">
                  <SeasonDialog supplierId={supplierId} season={season} />
                  <CopySeasonDialog season={season} />
                  <Button
                    variant="ghost"
                    aria-label={t("removeSeasonNamed", { name: season.label })}
                    onClick={() => {
                      setRemovingSeason({ id: season.id, label: season.label });
                    }}
                  >
                    {t("removeSeason")}
                  </Button>
                </div>
              )}
            </div>
            {season.rates.length === 0 ? (
              <p className="text-muted-foreground">{t("noRates")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("columns.item")}</TableHead>
                    <TableHead>{t("columns.mealPlan")}</TableHead>
                    <TableHead>{t("columns.occupancy")}</TableHead>
                    <TableHead>{t("columns.unit")}</TableHead>
                    <TableHead className="text-right">{t("columns.cost")}</TableHead>
                    {mayEdit && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {season.rates.map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell className="whitespace-normal">{rate.item}</TableCell>
                      <TableCell>{rate.mealPlan === "" ? "" : rate.mealPlan}</TableCell>
                      <TableCell>{rate.occupancy === "" ? "" : t(`occupancies.${rate.occupancy}`)}</TableCell>
                      <TableCell>{t(`units.${rate.unit}`)}</TableCell>
                      <TableCell className="numbers text-right">{rupees(rate.costPaise)}</TableCell>
                      {mayEdit && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <RateDialog seasonId={season.id} rate={rate} />
                            <Button
                              variant="ghost"
                              aria-label={t("removeRateNamed", { item: rate.item })}
                              onClick={() => {
                                setRemovingRate(rate.id);
                              }}
                            >
                              {t("removeRate")}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {mayEdit && (
              <div>
                <RateDialog seasonId={season.id} rate={null} />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("intro")}</p>
      <RefusalAlert error={changes.deleteSeason.error ?? changes.deleteRate.error} />
      {body()}
      {mayEdit && (
        <div className="flex flex-wrap gap-2">
          <SeasonDialog supplierId={supplierId} season={null} />
          <RateSheetButton supplierId={supplierId} seasons={rates.data?.seasons ?? []} />
        </div>
      )}
      <ConfirmDialog
        open={removingSeason !== null}
        onOpenChange={(next) => {
          if (!next) setRemovingSeason(null);
        }}
        title={t("removeSeasonTitle")}
        description={t("removeSeasonDescription")}
        action={t("removeSeason")}
        request={changes.deleteSeason}
        onConfirm={() => {
          if (removingSeason === null) return;
          changes.deleteSeason.mutate(
            { seasonId: removingSeason.id },
            {
              onSuccess: () => {
                toast.success(t("seasonRemoved"));
                setRemovingSeason(null);
              },
            },
          );
        }}
      />
      <ConfirmDialog
        open={removingRate !== null}
        onOpenChange={(next) => {
          if (!next) setRemovingRate(null);
        }}
        title={t("removeRateTitle")}
        description={t("removeRateDescription")}
        action={t("removeRate")}
        request={changes.deleteRate}
        onConfirm={() => {
          if (removingRate === null) return;
          changes.deleteRate.mutate(
            { rateId: removingRate },
            {
              onSuccess: () => {
                toast.success(t("rateRemoved"));
                setRemovingRate(null);
              },
            },
          );
        }}
      />
    </SectionCard>
  );
}
