"use client";

// "Calculate from the catalog" (release 7b): suggests the "From ₹X" price from the cheapest tier for two adults in the next
// season. Staff accept it by tapping Use; nothing is saved by itself and it is never refreshed on its own.
import { useTranslations } from "next-intl";
import { RefusalAlert } from "@/components/refusal-alert";
import { rupees } from "@/components/forms/money-field";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatCalendarDay } from "@/lib/format";
import { useCalculateFrom } from "./use-packages";

export function CalculateFromButton({
  packageId,
  onSuggested,
}: {
  packageId: string;
  onSuggested: (paise: number) => void;
}) {
  const t = useTranslations("packages.form");
  const calculate = useCalculateFrom();
  const found = calculate.data;
  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={calculate.isPending}
        onClick={() => {
          calculate.mutate(packageId);
        }}
      >
        {calculate.isPending && <Spinner aria-hidden="true" />}
        {t("calculate")}
      </Button>
      <RefusalAlert error={calculate.error} />
      {found !== undefined && (
        <div role="status" className="flex flex-wrap items-center gap-3">
          {found.fromPricePaise === null ? (
            <p className="text-muted-foreground">{t("calculateNone")}</p>
          ) : (
            <>
              <p className="numbers">
                {t("calculated", {
                  price: rupees(found.fromPricePaise),
                  tier: found.tierName ?? "",
                  day: found.forDate === null ? "" : formatCalendarDay(found.forDate),
                })}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (found.fromPricePaise !== null) onSuggested(found.fromPricePaise);
                }}
              >
                {t("useCalculated")}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
