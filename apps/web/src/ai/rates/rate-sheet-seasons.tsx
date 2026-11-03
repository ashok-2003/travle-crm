"use client";

// The seasons of a rate sheet's review (release ai3b): each season the rows to be saved go in. One the supplier already has with
// the same dates is reused as it is; a new one is named and dated here, the dates the sheet printed shown beside them, and a season
// that has already ended is flagged. Dates the sheet printed without a year are chosen by the person, never guessed.
import { useTranslations } from "next-intl";
import { useWatch, type Control } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { TextField } from "@/components/forms/text-field";
import { StatusBadge } from "@/components/status-badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import type { DraftValues, SeasonProblem } from "./rate-sheet-draft";

export function RateSheetSeasons({
  control,
  problems,
  existingLabels,
}: {
  control: Control<DraftValues>;
  problems: Map<number, SeasonProblem>;
  /** The names of the supplier's seasons that the sheet's seasons match, by season id. */
  existingLabels: Map<string, string>;
}) {
  const t = useTranslations("ai.rates.seasons");
  const seasons = useWatch({ control, name: "seasons" });
  const rows = useWatch({ control, name: "rows" });
  const used = new Set(rows.filter((row) => !row.left).map((row) => row.seasonKey));
  const shown = seasons
    .map((season, index) => ({ season, index }))
    .filter(({ season }) => used.has(String(season.key)));
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="rate-sheet-seasons" className="flex flex-col gap-3">
      <h3 id="rate-sheet-seasons" className="font-semibold">
        {t("title")}
      </h3>
      <ItemGroup className="gap-3">
        {shown.map(({ season, index }) => (
          <Item key={season.key} variant="outline" role="listitem" className="flex-col items-stretch">
            {season.existingSeasonId !== null ? (
              <ItemContent>
                <ItemTitle>{existingLabels.get(season.existingSeasonId) ?? season.label}</ItemTitle>
                <ItemDescription>{t("existing")}</ItemDescription>
              </ItemContent>
            ) : (
              <ItemContent className="w-full">
                <div className="flex flex-wrap items-center gap-2">
                  {season.inPast && <StatusBadge tone="attention">{t("inPast")}</StatusBadge>}
                  {problems.has(season.key) && (
                    <StatusBadge tone="bad">{t(`problems.${problems.get(season.key) ?? "dates"}`)}</StatusBadge>
                  )}
                  {season.printed !== "" && (
                    <span className="text-label text-muted-foreground">{t("printed", { dates: season.printed })}</span>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <TextField
                    control={control}
                    name={`seasons.${String(index)}.label` as `seasons.${number}.label`}
                    label={t("label")}
                  />
                  <DateField
                    control={control}
                    name={`seasons.${String(index)}.startsOn` as `seasons.${number}.startsOn`}
                    label={t("startsOn")}
                  />
                  <DateField
                    control={control}
                    name={`seasons.${String(index)}.endsOn` as `seasons.${number}.endsOn`}
                    label={t("endsOn")}
                  />
                </div>
              </ItemContent>
            )}
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
