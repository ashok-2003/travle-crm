// How an agency starts: three short guides, each a few numbered steps, opened one at a time.
import { useTranslations } from "next-intl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MarketingSection } from "./section";

const guides = ["sheet", "file", "team"] as const;
const steps = ["one", "two", "three"] as const;

export function GuidesSection() {
  const t = useTranslations("marketing.guides");
  return (
    <MarketingSection id="guides" title={t("title")}>
      <Accordion type="single" collapsible className="max-w-[860px]">
        {guides.map((guide) => (
          <AccordionItem key={guide} value={guide}>
            <AccordionTrigger className="text-body">{t(`items.${guide}.title`)}</AccordionTrigger>
            <AccordionContent>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-body">
                {steps.map((step) => (
                  <li key={step}>{t(`items.${guide}.steps.${step}`)}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </MarketingSection>
  );
}
