// What a sheet still needs before it can be read (S12): a name, and a phone, email or Instagram. Each ticked once matched.
import { CheckIcon, CircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";

export function FieldChecklist({ hasName, hasContact }: { hasName: boolean; hasContact: boolean }) {
  const t = useTranslations("sheets.connect.columns");
  const needs = [
    { label: t("needName"), met: hasName },
    { label: t("needContact"), met: hasContact },
  ];
  return (
    <section className="flex flex-col gap-2" aria-labelledby="sheet-needs">
      <h2 id="sheet-needs" className="text-section font-semibold">
        {hasName && hasContact ? t("ready") : t("notReady")}
      </h2>
      <ItemGroup>
        {needs.map(({ label, met }) => (
          <Item key={label} size="sm" role="listitem">
            <ItemMedia>
              {met ? (
                <CheckIcon aria-hidden="true" className="text-status-good-ink" />
              ) : (
                <CircleIcon aria-hidden="true" className="text-muted-foreground" />
              )}
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{label}</ItemTitle>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
