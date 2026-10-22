"use client";

// What the form means for the agency (spec 15, item 5), in plain sentences: the form is theirs, what visitors type is
// personal data they now hold, the offers tickbox (only once marketing consent is on) is a request and not proof,
// stopped enquiries are not kept, and changing the link breaks the old one. No Turnstile nudge (ruling F17).
import { features } from "@travel-crm/contracts/features";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function HelpCard() {
  const t = useTranslations("websiteFormSettings.help");
  const sentences = [
    "own",
    "personalData",
    ...(features.marketingConsent ? (["tick"] as const) : []),
    "stopped",
    "link",
  ] as const;
  return (
    <Card role="region" aria-labelledby="website-form-help">
      <CardHeader>
        <CardTitle>
          <h2 id="website-form-help">{t("heading")}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
          {sentences.map((sentence) => (
            <li key={sentence}>{t(sentence)}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
