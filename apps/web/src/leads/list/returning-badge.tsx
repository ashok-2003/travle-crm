"use client";

// The ↺ Returning marker (spec 4): the person had an earlier lead with the agency when this one came in. A fact
// beside the name, not a status: the registry's outline Badge.
import { RotateCcwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function ReturningBadge() {
  const t = useTranslations("leads");
  return (
    <Badge variant="outline">
      <RotateCcwIcon aria-hidden="true" />
      {t("returning")}
    </Badge>
  );
}
