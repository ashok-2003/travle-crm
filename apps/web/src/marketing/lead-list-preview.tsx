// The hero's picture, built from the app's own pieces rather than an image: the lead sources, flowing into one list
// of new leads, each with its stage and owner. Sample people, not anyone's data.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { ArrowDownIcon, ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { StageBadge } from "@/leads/stage-badge";

const sources = ["sheets", "ads", "whatsapp", "website", "files"] as const;

const rows: readonly { key: "first" | "second" | "third" | "fourth"; stage: LeadStage }[] = [
  { key: "first", stage: "new" },
  { key: "second", stage: "contacted" },
  { key: "third", stage: "quote_sent" },
  { key: "fourth", stage: "booking_requested" },
];

export function LeadListPreview() {
  const t = useTranslations("marketing.hero");
  return (
    <figure aria-label={t("graphic")} className="flex flex-col items-center gap-4 md:flex-row md:items-center">
      <ul className="flex flex-wrap justify-center gap-2 md:w-40 md:flex-col md:items-stretch">
        {sources.map((source) => (
          <li key={source}>
            <Badge variant="outline" className="h-8 w-full justify-center px-3">
              {t(`list.sources.${source}`)}
            </Badge>
          </li>
        ))}
      </ul>
      <ArrowDownIcon aria-hidden="true" className="size-5 text-muted-foreground md:hidden" />
      <ArrowRightIcon aria-hidden="true" className="hidden size-5 shrink-0 text-muted-foreground md:block" />
      <Card className="w-full min-w-0 flex-1">
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemGroup>
            {rows.map(({ key, stage }, index) => (
              <div key={key} role="listitem">
                {index > 0 && <ItemSeparator />}
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>{t(`list.rows.${key}.name`)}</ItemTitle>
                    <ItemDescription>{t(`list.rows.${key}.trip`)}</ItemDescription>
                  </ItemContent>
                  <ItemActions className="flex-col items-end gap-1">
                    <StageBadge stage={stage} />
                    <span className="text-caption text-muted-foreground">{t(`list.rows.${key}.owner`)}</span>
                  </ItemActions>
                </Item>
              </div>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>
    </figure>
  );
}
