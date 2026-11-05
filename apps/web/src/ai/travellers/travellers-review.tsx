"use client";

// The AI's reading of the travellers, to check: each person beside the row of the booking they fill (changeable, or "don't
// save"), and each thing read with a tick. A row's empty fields start ticked; one that already holds something else starts
// unticked and shows what it holds. An age alone is said as such: the date of birth is still needed. Nothing is saved from here.
import type { FillTraveller } from "@travel-crm/contracts/ai";
import type { Traveller } from "@travel-crm/contracts/bookings";
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldSet } from "@/components/ui/field";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fieldsOf, heldValue, type TravellerFieldKey } from "./traveller-fields";
import { useTravellerText } from "./use-traveller-text";

const NO_ROW = "none";

export function TravellersReview({
  people,
  rows,
  chosen,
  isTicked,
  onRow,
  onTick,
}: {
  people: readonly FillTraveller[];
  rows: readonly Traveller[];
  /** The row id each person fills, or null. */
  chosen: readonly (string | null)[];
  isTicked: (index: number, key: TravellerFieldKey) => boolean;
  onRow: (index: number, rowId: string | null) => void;
  onTick: (index: number, key: TravellerFieldKey, on: boolean) => void;
}) {
  const t = useTranslations("ai.travellers.review");
  const labels = useTranslations("ai.travellers.fields");
  const textOf = useTravellerText();
  const twice = chosen.filter((id, index) => id !== null && chosen.indexOf(id) !== index).length > 0;
  return (
    <div className="flex flex-col gap-4">
      {twice && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertDescription>{t("sameRow")}</AlertDescription>
        </Alert>
      )}
      <ItemGroup className="gap-3">
        {people.map((person, index) => {
          const rowId = chosen[index] ?? null;
          const row = rows.find((one) => one.id === rowId);
          const name = person.saidName === "" ? t("unnamed", { number: index + 1 }) : person.saidName;
          const rowSelect = `traveller-row-${String(index)}`;
          return (
            <Item key={`${String(index)}-${person.saidName}`} variant="muted" role="listitem" className="items-start">
              <ItemContent className="gap-3">
                <ItemTitle>{name}</ItemTitle>
                <Field>
                  <FieldLabel htmlFor={rowSelect}>{t("rowFor", { name })}</FieldLabel>
                  <Select
                    value={rowId ?? NO_ROW}
                    onValueChange={(next) => {
                      onRow(index, next === NO_ROW ? null : next);
                    }}
                  >
                    <SelectTrigger id={rowSelect} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_ROW}>{t("noRow")}</SelectItem>
                      {rows.map((one, position) => (
                        <SelectItem key={one.id} value={one.id}>
                          {one.name === ""
                            ? t("row", { number: position + 1 })
                            : t("rowNamed", { number: position + 1, name: one.name })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rowId === null && <FieldDescription>{t("noRowHint", { rows: rows.length })}</FieldDescription>}
                </Field>
                {person.ageOnly !== undefined && (
                  <p className="text-muted-foreground">{t("ageOnly", { age: person.ageOnly })}</p>
                )}
                {person.idNumberUnreadable === true && <p className="text-muted-foreground">{t("idUnreadable")}</p>}
                {row !== undefined && (
                  <FieldSet>
                    {fieldsOf(person).map((key) => {
                      const id = `traveller-${String(index)}-${key}`;
                      const held = heldValue(row, key);
                      return (
                        <Field key={key} orientation="horizontal" className="min-h-11">
                          <Checkbox
                            id={id}
                            checked={isTicked(index, key)}
                            onCheckedChange={(on) => {
                              onTick(index, key, on === true);
                            }}
                          />
                          <FieldContent>
                            <FieldLabel htmlFor={id} className="font-normal">
                              <span className="font-medium">{labels(key)}</span>
                              <span className="text-people-tint-ink">{textOf(key, person[key])}</span>
                            </FieldLabel>
                            {held !== undefined && (
                              <FieldDescription>{t("now", { value: textOf(key, held) })}</FieldDescription>
                            )}
                            {key === "identity" && <FieldDescription>{t("idChecked")}</FieldDescription>}
                          </FieldContent>
                        </Field>
                      );
                    })}
                  </FieldSet>
                )}
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}
