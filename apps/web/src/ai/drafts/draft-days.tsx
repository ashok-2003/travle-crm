"use client";

// The drafted package's day-by-day plan in the review: a title and a few lines per day, each with the line it was read from.
import type { PackageDraft } from "@travel-crm/contracts/ai";
import { useTranslations } from "next-intl";
import type { Control } from "react-hook-form";
import { TextField } from "@/components/forms/text-field";
import { Item, ItemContent, ItemGroup } from "@/components/ui/item";
import { NoteField } from "@/leads/form/note-field";
import { EvidenceNote } from "./draft-evidence";
import type { ReviewValues } from "./draft-values";

export function DraftDays({ draft, control }: { draft: PackageDraft; control: Control<ReviewValues> }) {
  const t = useTranslations("ai.drafts.days");
  // The form holds only the days that were found, in order, so the draft's gaps are skipped the same way.
  const found = draft.days.filter((day) => day.value !== null);
  if (found.length === 0) return <p className="text-caption text-muted-foreground">{t("none")}</p>;
  return (
    <ItemGroup className="gap-3">
      {found.map((day, index) => (
        <Item
          key={day.evidence[0]?.token ?? String(index)}
          variant="outline"
          role="listitem"
          className="flex-col items-stretch"
        >
          <ItemContent className="w-full gap-2">
            <TextField
              control={control}
              name={`days.${String(index)}.title` as `days.${number}.title`}
              label={t("title", { number: index + 1 })}
            />
            <NoteField
              control={control}
              name={`days.${String(index)}.description` as `days.${number}.description`}
              label={t("description", { number: index + 1 })}
            />
            <EvidenceNote {...day} />
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}
