"use client";

// New quote from the Quotes list: a quote belongs to a lead, so the dialog asks which (search an existing one, or make a
// new lead first), then offers the lead's own New quote choices: blank, or from a package.
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/form-field";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import type { ReturnFocusTo } from "@/components/return-focus";
import { TextLink } from "@/components/text-link";
import { useLead } from "@/leads/lead/use-lead";
import { routes } from "@/lib/routes";
import { LeadPicker, type PickedLead } from "@/today/lead-picker";
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
  const lead = useLead(picked?.id ?? "", { enabled: picked !== null });
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
      returnFocusTo={returnFocusTo}
    >
      <div className="flex flex-col gap-4">
        <FormField label={t("lead")} hint={t("leadHint")}>
          {(links) => <LeadPicker links={links} value={picked} onChange={setPicked} words={{ none: t("choose") }} />}
        </FormField>
        <TextLink href={routes.newLead}>{t("newLead")}</TextLink>
        {picked !== null && lead.data !== undefined && <NewQuoteMenu lead={lead.data} />}
        {picked !== null && lead.isError && (
          <LoadFailedAlert message={t("loadFailed")} error={lead.error} onRetry={() => void lead.refetch()} />
        )}
      </div>
    </ResponsiveDialog>
  );
}
