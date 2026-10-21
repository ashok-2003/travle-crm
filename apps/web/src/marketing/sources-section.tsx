// Where leads come from: the product's main selling point (spec 3.1). Each source says whether it works today.
import { useTranslations } from "next-intl";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { FeatureStatus, type Availability } from "./feature-status";
import { MarketingSection } from "./section";

const sources: readonly {
  key: "sheets" | "files" | "byHand" | "whatsapp" | "metaAds" | "website" | "tools";
  availability: Availability;
}[] = [
  { key: "sheets", availability: "live" },
  { key: "files", availability: "live" },
  { key: "byHand", availability: "live" },
  { key: "whatsapp", availability: "soon" },
  { key: "metaAds", availability: "soon" },
  { key: "website", availability: "soon" },
  { key: "tools", availability: "soon" },
];

export function SourcesSection() {
  const t = useTranslations("marketing.sources");
  return (
    <MarketingSection id="sources" title={t("title")} intro={t("intro")}>
      <ItemGroup className="max-w-[860px]">
        {sources.map(({ key, availability }, index) => (
          <div key={key} role="listitem">
            {index > 0 && <ItemSeparator />}
            <Item>
              <ItemContent>
                <ItemTitle>{t(`items.${key}.name`)}</ItemTitle>
                <ItemDescription>{t(`items.${key}.detail`)}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <FeatureStatus availability={availability} />
              </ItemActions>
            </Item>
          </div>
        ))}
      </ItemGroup>
    </MarketingSection>
  );
}
