"use client";

// At the top of a package's page, in red: what the AI still needs before it may sell the package (a package made from
// a PDF arrives with whatever the brochure didn't say), each a link to where it is filled in.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { TextLink } from "@/components/text-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { gapPlace } from "./sell-card";

export function SellGapsAlert({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.sell");
  if (detail.sellGaps.length === 0) return null;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertTitle>{t("missingTitle")}</AlertTitle>
      <AlertDescription>
        {/* One link a line, each a 44px touch target. */}
        <ul className="flex flex-col">
          {detail.sellGaps.map((gap) => (
            <li key={gap}>
              <TextLink href={gapPlace[gap]}>{t(`gaps.${gap}`)}</TextLink>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
