"use client";

// A column's values and where each goes (spec 3.2 step 2, B11): an Owner value to a lead worker, a Stage value to a
// stage, a Role value to a role. Each value with how many rows hold it, in mono at the end, then its own Select, the
// file's default first. On a phone the Select takes the row's full width under the value.
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatCount } from "@/lib/format";
import { MatchSelect } from "./match-select";

export function ValueMatcher({
  heading,
  values,
  targets,
  chosen,
  onChoose,
  defaultLabel,
  disabled = false,
}: {
  heading: string;
  values: readonly { value: string; rows: number }[];
  targets: readonly { value: string; label: string }[];
  /** Each value's target; a value missing or null goes to the default. */
  chosen: ReadonlyMap<string, string | null>;
  onChoose: (value: string, target: string | null) => void;
  /** What the default is, as the first choice: "Asha Sharma (Owner), the default". */
  defaultLabel: string;
  disabled?: boolean;
}) {
  const t = useTranslations("imports.values");
  const headingId = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={headingId}>
      <h3 id={headingId} className="text-label font-semibold">
        {heading}
      </h3>
      <ItemGroup>
        {values.map(({ value, rows }, index) => (
          <Fragment key={value}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem">
              <ItemContent className="flex-row items-baseline justify-between gap-4">
                <ItemTitle className="wrap-anywhere script-leading">{value}</ItemTitle>
                <span className="numbers text-right">{formatCount(rows)}</span>
              </ItemContent>
              <ItemActions className="basis-full md:basis-64">
                <MatchSelect
                  label={t("targetFor", { value })}
                  value={chosen.get(value) ?? null}
                  noneLabel={defaultLabel}
                  options={targets}
                  disabled={disabled}
                  onChange={(target) => {
                    onChoose(value, target);
                  }}
                />
              </ItemActions>
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    </section>
  );
}
