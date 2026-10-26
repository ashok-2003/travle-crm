"use client";

// The contact panel beside a chat (sales inbox spec, section 4): where the sale is worked without leaving the chat.
// The person at the top (picture, name, phone to copy, a link to the lead), the chat's tags; then the lead itself, through the lead page's
// own parts so a lead changes the same way wherever it is changed: the stage (Won is "converted"), the follow-ups, the
// owner, the trip, and the timeline with its notes. A chat whose person has no lead offers Start a new lead instead.
import type { ConversationHeader } from "@travel-crm/contracts/inbox";
import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OwnerCard } from "@/leads/lead/owner-card";
import { StageBar } from "@/leads/lead/stage-bar";
import { Timeline } from "@/leads/lead/timeline";
import { TripCard } from "@/leads/lead/trip-card";
import { useLead } from "@/leads/lead/use-lead";
import { WorkCard } from "@/leads/lead/work-card";
import { formatPhoneNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { leadRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { ChatAvatar } from "./chat-avatar";
import { ChatTags } from "./chat-tags";
import { StartLeadButton } from "./start-lead-button";

function LeadParts({ leadId }: { leadId: string }) {
  const t = useTranslations("inbox.panel");
  const lead = useLead(leadId);
  if (lead.data === undefined) {
    return lead.isError ? (
      <ErrorState
        message={t("leadFailed")}
        error={lead.error}
        retryLabel={t("retry")}
        onRetry={() => void lead.refetch()}
      />
    ) : (
      <LoadingRows shape="twoLines" label={t("loadingLead")} />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="text-label font-medium text-muted-foreground">{t("stage")}</h3>
        <StageBar lead={lead.data} />
      </section>
      <WorkCard lead={lead.data} />
      <OwnerCard lead={lead.data} />
      <TripCard lead={lead.data} />
      <Timeline lead={lead.data} />
    </div>
  );
}

export function ContactPanel({ header, onClose }: { header: ConversationHeader; onClose?: () => void }) {
  const t = useTranslations("inbox.panel");
  const mayStartLead = useHolds("leads:create");
  const name = header.name ?? formatPhoneNumber(header.phone);
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-6 p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-section font-semibold">{t("title")}</h2>
          {onClose !== undefined && (
            <Button variant="ghost" size="icon" aria-label={t("close")} onClick={onClose}>
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="flex flex-col items-center gap-2 text-center">
          <ChatAvatar name={header.name} size="large" />
          <p className={cn("text-section font-semibold script-leading", header.name === null && "numbers")}>{name}</p>
          <p className="flex items-center gap-1 numbers text-muted-foreground">
            {formatPhoneNumber(header.phone)}
            <CopyButton value={header.phone} label={t("copyPhone")} iconOnly />
          </p>
          {header.lead !== null && <TextLink href={leadRoute(header.lead.id)}>{t("openLead")}</TextLink>}
        </div>
        <section className="flex flex-col gap-2">
          <h3 className="text-label font-medium text-muted-foreground">{t("tags")}</h3>
          <ChatTags header={header} />
        </section>
        {header.lead?.open === true ? (
          <LeadParts leadId={header.lead.id} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-muted-foreground">
              {header.pastCustomer ? t("pastCustomer") : header.lead === null ? t("noLead") : t("closedLead")}
            </p>
            {mayStartLead && header.pastCustomer && <StartLeadButton conversationId={header.id} />}
            {header.lead !== null && <LeadParts leadId={header.lead.id} />}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
