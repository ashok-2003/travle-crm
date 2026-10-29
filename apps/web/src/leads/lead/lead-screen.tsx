"use client";

// /leads/<id> (spec 3.4): one lead. The way back to Leads keeps the list's filters, which the list's links carry. The
// person and the main buttons, the stage, then the lead's cards: its open follow-ups, the AI's insight, the person, the trip, the owner
// and source, and the timeline. Below 1280px it is one reading panel 720px wide; from 1280px, where a computer has room
// beside it, the timeline moves into a column of its own beside the cards, so the lead's history shows next to its
// details, and always sticks: 24px from the top while it fits the screen, and when it is taller, as far up as brings
// its end into view, so a new note that makes it taller never makes it jump. A lead that doesn't exist, was removed
// or is someone else's (out of the member's scope) is "not found" alike (R26), so nothing says another's lead exists;
// any other failure says so with Try again.
import { isOpenStage, type LeadDetail } from "@travel-crm/contracts/crm";
import { SearchXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { LeadBookings } from "@/ai/lead-bookings";
import { LeadInsight } from "@/ai/lead-insight";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { BackLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { useElementHeight } from "@/lib/use-element-height";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { LeadQuotesCard } from "@/quotes/lead-quotes-card";
import { LeadSalesCard } from "@/sales/lead-sales-card";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";
import { listFiltersHref, listFiltersOf } from "../list/list-filters";
import { LeadChat } from "@/inbox/lead-chat";
import { LeadHeader } from "./lead-header";
import { OwnerCard } from "./owner-card";
import { PersonCard } from "./person-card";
import { StageBar } from "./stage-bar";
import { Timeline } from "./timeline";
import { TripCard } from "./trip-card";
import { useLead } from "./use-lead";
import { WorkCard } from "./work-card";

/**
 * Where the sticky timeline's top sits: 24px down while it fits the screen; when it is taller, above the screen by as
 * much as brings its end 24px above the screen's foot, so it scrolls to its end and holds there.
 */
const stickyTop = (height: number | null) =>
  height === null ? "1.5rem" : `min(1.5rem, calc(100svh - ${String(height)}px - 1.5rem))`;

function LeadColumns({ lead }: { lead: LeadDetail }) {
  // On a plan without quotes the card would only say it can't load: it isn't shown.
  const modules = useSubscription().data?.modules;
  const canSeeQuotes = useHolds("quotes:view") && isOnPlan({ module: "quotes" }, modules);
  const timeline = useRef<HTMLDivElement>(null);
  const height = useElementHeight(timeline);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
      <div className="flex flex-col gap-6">
        <LeadSalesCard leadId={lead.id} open={isOpenStage(lead.stage)} />
        <LeadBookings leadId={lead.id} />
        <LeadInsight leadId={lead.id} />
        <WorkCard lead={lead} />
        <PersonCard lead={lead} />
        <TripCard lead={lead} />
        {canSeeQuotes && <LeadQuotesCard lead={lead} />}
        <OwnerCard lead={lead} />
        <LeadChat leadId={lead.id} />
      </div>
      <div
        ref={timeline}
        className="xl:sticky xl:top-(--timeline-top)"
        style={{ "--timeline-top": stickyTop(height) } as CSSProperties}
      >
        <Timeline lead={lead} />
      </div>
    </div>
  );
}

export function LeadScreen({ leadId }: { leadId: string }) {
  const t = useTranslations("leads.lead");
  const tCommon = useTranslations("common");
  const scope = viewScope(useMe(), "leads:view") === "all" ? "all" : "own";
  const back = listFiltersHref(listFiltersOf(useSearchParams(), scope));
  const lead = useLead(leadId);

  const body = (): ReactNode => {
    if (lead.data) {
      return (
        <>
          <LeadHeader lead={lead.data} />
          <StageBar lead={lead.data} />
          <LeadColumns lead={lead.data} />
        </>
      );
    }
    if (!lead.valid || refusalOf(lead.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (lead.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={lead.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void lead.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6 xl:max-w-none">
      <BackLink href={back} label={t("back")} />
      {body()}
    </div>
  );
}
