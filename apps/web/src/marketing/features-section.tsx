// What the product does, in three groups of plain sentences (DESIGN.md: no grid of identical icon cards), each saying
// whether it works today.
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Messages } from "@/i18n/messages";
import { FeatureStatus, type Availability } from "./feature-status";
import { MarketingSection } from "./section";

type Item = keyof Messages["marketing"]["features"]["items"];

const groups: readonly { key: "sell" | "team" | "run"; items: readonly [Item, Availability][] }[] = [
  {
    key: "sell",
    items: [
      ["today", "live"],
      ["pipeline", "live"],
      ["timeline", "live"],
      ["bulk", "soon"],
    ],
  },
  {
    key: "team",
    items: [
      ["assignment", "soon"],
      ["roles", "live"],
      ["dashboard", "soon"],
      ["ratings", "soon"],
    ],
  },
  {
    key: "run",
    items: [
      ["branding", "live"],
      ["audit", "live"],
      ["exports", "live"],
      ["phone", "live"],
    ],
  },
];

export function FeaturesSection() {
  const t = useTranslations("marketing.features");
  return (
    <MarketingSection id="features" title={t("title")}>
      <div className="grid gap-10 md:grid-cols-3">
        {groups.map(({ key, items }) => (
          <div key={key} className="flex flex-col gap-4">
            <h3 className="text-section font-semibold">{t(`groups.${key}`)}</h3>
            <ul className="flex flex-col gap-4">
              {items.map(([item, availability]) => (
                <li key={item} className="flex gap-3">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col items-start gap-1.5">
                    <span>{t(`items.${item}`)}</span>
                    <FeatureStatus availability={availability} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </MarketingSection>
  );
}
