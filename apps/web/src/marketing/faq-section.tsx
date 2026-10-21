// The questions agencies ask before they sign up, each answered in a sentence or two.
import { useTranslations } from "next-intl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MarketingSection } from "./section";

const questions = ["data", "whatsapp", "ai", "phone", "setup", "team", "leave"] as const;

export function FaqSection() {
  const t = useTranslations("marketing.faq");
  return (
    <MarketingSection id="faq" title={t("title")}>
      <Accordion type="multiple" className="max-w-[860px]">
        {questions.map((question) => (
          <AccordionItem key={question} value={question}>
            <AccordionTrigger className="text-body">{t(`items.${question}.question`)}</AccordionTrigger>
            <AccordionContent>
              <p className="max-w-[65ch] text-body text-pretty text-muted-foreground">
                {t(`items.${question}.answer`)}
              </p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </MarketingSection>
  );
}
