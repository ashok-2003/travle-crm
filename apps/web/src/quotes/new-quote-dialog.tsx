"use client";

// New quote from the Quotes list: a quote belongs to a lead, so a centred popup lists the newest leads (or the ones a
// search finds) right under its search box, with a link to make a new lead; once one is chosen it offers that lead's
// own New quote choices: blank, or from a package.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { Button } from "@/components/ui/button";
import { useLead } from "@/leads/lead/use-lead";
import type { PickedLead } from "@/today/lead-picker";
import { LeadStep } from "./lead-step";
import { NewQuoteMenu } from "./new-quote-menu";

export function NewQuoteDialog({
  open,
  onOpenChange,
  returnFocusTo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
}) {
  const t = useTranslations("quotes.list.newQuote");
  const [picked, setPicked] = useState<PickedLead | null>(null);
  const [creating, setCreating] = useState(false);
  const lead = useLead(picked?.id ?? "", { enabled: picked !== null });
  return (
    <ResponsiveDialog
      centered
      open={open}
      onOpenChange={onOpenChange}
      busy={creating}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
    >
      <div className="flex flex-col gap-4">
        {picked === null ? (
          <LeadStep onPick={setPicked} />
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="min-w-0 font-medium">{picked.name}</span>
              <Button
                variant="outline"
                disabled={creating}
                onClick={() => {
                  setPicked(null);
                }}
              >
                {t("change")}
              </Button>
            </div>
            {lead.data !== undefined && <NewQuoteMenu lead={lead.data} onPending={setCreating} />}
            {lead.isError && (
              <LoadFailedAlert message={t("loadFailed")} error={lead.error} onRetry={() => void lead.refetch()} />
            )}
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
