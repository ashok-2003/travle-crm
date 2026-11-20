"use client";

// The Leads header's actions (spec 3.1): New lead stays the one primary button, for whoever may add leads (leads:create),
// and Import and Export follow it as outline pills, each showing itself to whoever may use it, in one row that wraps
// (the three fit a 390px phone), then the way to the pipeline board (release C).
import { KanbanIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RevolvingBorder } from "@/components/revolving-border";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { LeadExportButton } from "../export/lead-export-button";
import { LeadImportButton } from "../import/lead-import-button";
import { NewLeadButton } from "../new-lead-button";

/** The ring round Pipeline in a rainbow of the brand's own colours (owner, 2026-11-20): red, amber, green, teal, blue,
 * violet. */
const rainbow = [
  "var(--brand-status-bad-dot)",
  "var(--brand-status-attention-dot)",
  "var(--brand-status-good-dot)",
  "var(--brand-stage-contacted-dot)",
  "var(--brand-action)",
  "var(--brand-people)",
] as const;

export function LeadsHeaderActions() {
  const t = useTranslations("leads.pipeline");
  return (
    <div className="flex flex-wrap items-start gap-2">
      {useHolds("leads:create") && <NewLeadButton />}
      <LeadImportButton />
      <LeadExportButton />
      {/* The pipeline board's way in, with a rainbow ring turning round its edge so it stands out (owner, 2026-11-20). */}
      <RevolvingBorder colors={rainbow}>
        <Button asChild variant="outline">
          <Link href={routes.leadsPipeline}>
            <KanbanIcon aria-hidden="true" />
            {t("toPipeline")}
          </Link>
        </Button>
      </RevolvingBorder>
    </div>
  );
}
