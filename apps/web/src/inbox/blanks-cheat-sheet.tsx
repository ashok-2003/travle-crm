"use client";

// The message library's blanks (release 5, scope 3.5), listed for the Owner who writes the messages: what each brace
// word becomes for a customer. The words in the list are the contracts' own (blankNames), so a new blank can't be left
// unexplained: a test reads both.
import { blankNames } from "@travel-crm/contracts/inbox";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Details } from "@/components/details";
import { InfoHint } from "@/components/info-hint";
import { Card, CardContent } from "@/components/ui/card";

export function BlanksCheatSheet() {
  const t = useTranslations("inbox.quickReplies.blanks");
  const headingId = useId();
  return (
    <Card role="region" aria-labelledby={headingId}>
      <CardContent className="flex flex-col gap-2">
        <h3 id={headingId} className="flex items-center gap-1 font-medium">
          {t("heading")}
          <InfoHint term={t("heading")}>{t("info")}</InfoHint>
        </h3>
        <Details rows={blankNames.map((name) => ({ label: `{${name}}`, value: t(name) }))} />
      </CardContent>
    </Card>
  );
}
