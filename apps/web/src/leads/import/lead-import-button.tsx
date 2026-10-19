"use client";

// The Leads header's Import (spec 3.1), for whoever may import (leads:create and leads:assign, which the api checks
// too): an outline pill beside New lead. Importing is a change, so while the subscription refuses changes the button
// is off and says why (useWriteAccess).
import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function LeadImportButton() {
  const t = useTranslations("leads.import");
  const mayCreate = useHolds("leads:create");
  const mayAssign = useHolds("leads:assign");
  const write = useWriteAccess("change");
  const hintId = useId();
  if (!mayCreate || !mayAssign) return null;
  const words = (
    <>
      <UploadIcon aria-hidden="true" />
      {t("button")}
    </>
  );
  if (write.allowed) {
    return (
      <Button asChild variant="outline">
        <Link href={routes.leadImport}>{words}</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" disabled aria-describedby={hintId}>
        {words}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
