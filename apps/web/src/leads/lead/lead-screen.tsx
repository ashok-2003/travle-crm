"use client";

// /leads/<id> (spec 3.4): one lead. The way back to Leads keeps the list's filters, which the list's links carry. The
// person and the main buttons, the stage, then the lead's cards: its open follow-ups, the person, the trip, the owner
// and source, and the timeline. Below 1280px it is one reading panel 720px wide; from 1280px, where a computer has room
// beside it, the timeline moves into a column of its own beside the cards, so the lead's history shows next to its
// details, and stays in view while the cards scroll whenever it fits the screen. A lead that doesn't exist, was removed
// or is someone else's (out of the member's scope) is "not found" alike (R26), so nothing says another's lead exists;
// any other failure says so with Try again.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { SearchXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { BackLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { useFitsScreen } from "@/lib/use-fits-screen";
import { cn } from "@/lib/utils";
import { useMe, viewScope } from "@/session/me-context";
import { listFiltersHref, listFiltersOf } from "../list/list-filters";
import { LeadHeader } from "./lead-header";
import { OwnerCard } from "./owner-card";
import { PersonCard } from "./person-card";
import { StageBar } from "./stage-bar";
import { Timeline } from "./timeline";
import { TripCard } from "./trip-card";
import { useLead } from "./use-lead";
import { WorkCard } from "./work-card";

/** The room the timeline keeps when it stays in view: 24px above it (top-6) and as much below. */
const STICKY_ROOM = 48;

function LeadColumns({ lead }: { lead: LeadDetail }) {
  const timeline = useRef<HTMLDivElement>(null);
  const timelineFits = useFitsScreen(timeline, STICKY_ROOM);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
      <div className="flex flex-col gap-6">
        <WorkCard lead={lead} />
        <PersonCard lead={lead} />
        <TripCard lead={lead} />
        <OwnerCard lead={lead} />
      </div>
      <div ref={timeline} className={cn(timelineFits && "xl:sticky xl:top-6")}>
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
