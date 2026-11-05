"use client";

// The drafted package's seasons in the review: a name and dates, then one amount per room type with the line it was read from.
// Where the documents print different prices for a room, each is offered with its line and the owner chooses; the amount fills in.
import type { DraftSeason } from "@travel-crm/contracts/ai";
import { roomTypes } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { useWatch, type Control, type UseFormSetValue } from "react-hook-form";
import { DateField } from "@/components/date-field";
import { MoneyField, rupees, rupeesFieldText } from "@/components/forms/money-field";
import { TextField } from "@/components/forms/text-field";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { roomPriceKey } from "@/room-prices/room-prices";
import { AlternativesChoice, EvidenceNote } from "./draft-evidence";
import type { ReviewValues } from "./draft-values";

interface Props {
  seasons: readonly DraftSeason[];
  control: Control<ReviewValues>;
  setValue: UseFormSetValue<ReviewValues>;
}

function SeasonItem({
  season,
  index,
  control,
  setValue,
}: Omit<Props, "seasons"> & { season: DraftSeason; index: number }) {
  const t = useTranslations("ai.drafts.seasons");
  const form = useTranslations("packages.form");
  const at = `seasons.${String(index)}` as `seasons.${number}`;
  const chosen = useWatch({ control, name: `${at}.choices` });
  const offered = useWatch({ control, name: "roomTypes" });
  // Each room the package sells, and any the documents price.
  const shown = roomTypes.filter((room) => offered.includes(room) || season.prices[room].length > 0);
  return (
    <Item variant="outline" role="listitem" className="flex-col items-stretch">
      <ItemContent className="w-full gap-3">
        <ItemTitle>{season.label.value ?? t("untitled")}</ItemTitle>
        <EvidenceNote {...season.label} />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField control={control} name={`${at}.label`} label={t("label")} />
          <DateField control={control} name={`${at}.startsOn`} label={t("startsOn")} />
          <DateField control={control} name={`${at}.endsOn`} label={t("endsOn")} />
        </div>
        <div className="flex flex-col gap-4">
          {shown.map((room) => {
            const alternatives = season.prices[room];
            return (
              <div key={room} className="flex flex-col gap-1">
                {alternatives.length > 1 && (
                  <AlternativesChoice
                    legend={t("choosePrice", { room: form(`roomTypeNames.${room}`) })}
                    chosen={chosen[room]}
                    alternatives={alternatives.map((one) => ({
                      shown: one.value === null ? "" : rupees(one.value),
                      evidence: one.evidence,
                      checkThis: one.checkThis,
                    }))}
                    onChoose={(choice) => {
                      const paise = alternatives[choice]?.value ?? null;
                      setValue(`${at}.choices.${room}`, String(choice));
                      setValue(`${at}.prices.${roomPriceKey(room)}`, paise === null ? "" : rupeesFieldText(paise));
                    }}
                  />
                )}
                <MoneyField
                  control={control}
                  name={`${at}.prices.${roomPriceKey(room)}`}
                  label={t("price", { room: form(`roomTypeNames.${room}`) })}
                />
                {alternatives.length === 1 && (
                  <EvidenceNote
                    evidence={alternatives[0]?.evidence ?? []}
                    checkThis={alternatives[0]?.checkThis ?? false}
                  />
                )}
                {alternatives.length === 0 && <EvidenceNote evidence={[]} checkThis={false} />}
              </div>
            );
          })}
        </div>
      </ItemContent>
    </Item>
  );
}

export function DraftSeasons({ seasons, control, setValue }: Props) {
  const t = useTranslations("ai.drafts.seasons");
  if (seasons.length === 0) return <p className="text-caption text-muted-foreground">{t("none")}</p>;
  return (
    <ItemGroup className="gap-3">
      {seasons.map((season, index) => (
        <SeasonItem
          key={`${season.startsOn}-${String(index)}`}
          season={season}
          index={index}
          control={control}
          setValue={setValue}
        />
      ))}
    </ItemGroup>
  );
}
