"use client";

// The Leads header's actions (spec 3.1): New lead stays the one primary button, for whoever may add leads (leads:create),
// and Import and Export follow it as outline pills, each showing itself to whoever may use it, in one row that wraps
// (the three fit a 390px phone), then the way to the pipeline board (release C).
import { KanbanIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { LeadExportButton } from "../export/lead-export-button";
import { LeadImportButton } from "../import/lead-import-button";
import { NewLeadButton } from "../new-lead-button";

export function LeadsHeaderActions() {
  const t = useTranslations("leads.pipeline");
  return (
    <div className="flex flex-wrap items-start gap-2">
      {useHolds("leads:create") && <NewLeadButton />}
      <LeadImportButton />
      <LeadExportButton />
      <Button asChild variant="outline">
        <Link href={routes.leadsPipeline}>
          <KanbanIcon aria-hidden="true" />
          {t("toPipeline")}
        </Link>
      </Button>
    </div>
  );
}
