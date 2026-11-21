"use client";

// /leads/<id> (spec 3.4; the lead page's revamp, 2026-11-21): one lead, its parts in the order a salesperson asks. Is it
// worth my time (the header: who, how warm; the stage; any suggestion of the AI's), what do I do now (Follow-ups), what
// do they want (the trip), then the AI's reasoning, the chat, the history, quotes and bookings. The way back to Leads
// keeps the list's filters, which the list's links carry.
//
// From 1280px, two columns: on the left, scrolling with the page, the AI's suggestion and bookings, Follow-ups, the trip,
// the WhatsApp chat (tall), quotes, bookings, departures, owner and source; on the right, sticky at the screen's height,
// the AI's guess and under it the timeline, whose entries scroll in their own box. Narrower, one column in the phone's
// order, 720px at most; and on a phone Call, WhatsApp and Note stay in a bar at the screen's foot. The two arrangements
// are two orders, so the one shown is the one in the page (and so the order of the keyboard and screen readers).
//
// A lead that doesn't exist, was removed or is someone else's (out of the member's scope) is "not found" alike (R26),
// so nothing says another's lead exists; any other failure says so with Try again.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { SearchXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, type ReactNode, type RefObject } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { BackLink } from "@/components/text-link";
import { refusalOf } from "@/data/api-error";
import { useMediaQuery } from "@/lib/use-media-query";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useHolds, useMe, viewScope } from "@/session/me-context";
import { LeadBookingsCard } from "@/bookings/lead-bookings-card";
import { LeadDeparturesCard } from "@/departures/lead-departures-card";
import { LeadQuotesCard } from "@/quotes/lead-quotes-card";
import { LeadInsight } from "@/ai/insight-card";
import { StageSuggestionCard } from "@/ai/stage-suggestion";
import { LeadBookings } from "@/ai/lead-bookings";
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";
import { listFiltersHref, listFiltersOf } from "../list/list-filters";
import { LeadChat } from "@/inbox/lead-chat";
import { FollowUpsCard } from "./follow-ups-card";
import { LeadActionBar } from "./lead-action-bar";
import { LeadHeader } from "./lead-header";
import { OwnerCard } from "./owner-card";
import { PersonConsent } from "./person-consent";
import { StageBar } from "./stage-bar";
import { Timeline } from "./timeline";
import { TripCard } from "./trip-card";
import { usePrefetchLeadPanels } from "./prefetch-lead-panels";
import { useLead } from "./use-lead";

/** How many of the newest entries the timeline shows in one column before Show more. */
const firstEntries = 5;

function LeadColumns({ lead, noteForm }: { lead: LeadDetail; noteForm: RefObject<HTMLFormElement | null> }) {
  // On a plan without quotes the card would only say it can't load: it isn't shown.
  const modules = useSubscription().data?.modules;
  const canSeeQuotes = useHolds("quotes:view") && isOnPlan({ module: "quotes" }, modules);
  const twoColumns = useMediaQuery("(min-width: 1280px)");
  const first = (
    <>
      <StageSuggestionCard leadId={lead.id} />
      <LeadBookings leadId={lead.id} />
      <FollowUpsCard lead={lead} />
      <TripCard lead={lead} />
    </>
  );
  const last = (
    <>
      {canSeeQuotes && <LeadQuotesCard lead={lead} />}
      <LeadBookingsCard lead={lead} />
      <LeadDeparturesCard leadId={lead.id} />
      <OwnerCard lead={lead}>
        <PersonConsent leadId={lead.id} personName={lead.person.name} />
      </OwnerCard>
    </>
  );
  if (twoColumns) {
    return (
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start gap-6">
        <div data-column="cards" className="flex flex-col gap-6">
          {first}
          <LeadChat leadId={lead.id} />
          {last}
        </div>
        <div data-column="history" className="sticky top-6 flex h-[calc(100svh-3rem)] flex-col gap-6 overflow-y-auto">
          <LeadInsight leadId={lead.id} />
          <Timeline lead={lead} boxed noteRef={noteForm} />
        </div>
      </div>
    );
  }
  return (
    <div data-column="one" className="flex flex-col gap-6">
      {first}
      <LeadInsight leadId={lead.id} />
      <LeadChat leadId={lead.id} />
      <Timeline lead={lead} firstShown={firstEntries} noteRef={noteForm} />
      {last}
    </div>
  );
}

export function LeadScreen({ leadId }: { leadId: string }) {
  const t = useTranslations("leads.lead");
  const tCommon = useTranslations("common");
  const scope = viewScope(useMe(), "leads:view") === "all" ? "all" : "own";
  const back = listFiltersHref(listFiltersOf(useSearchParams(), scope));
  const lead = useLead(leadId);
  const phone = !useWideScreen();
  const noteForm = useRef<HTMLFormElement>(null);
  usePrefetchLeadPanels(leadId, lead.valid);

  const toNote = () => {
    const box = noteForm.current?.querySelector("textarea");
    if (!box) return;
    box.scrollIntoView({ block: "center" });
    box.focus({ preventScroll: true });
  };

  const body = (): ReactNode => {
    if (lead.data) {
      return (
        <>
          <LeadHeader lead={lead.data} />
          <StageBar lead={lead.data} />
          <LeadColumns lead={lead.data} noteForm={noteForm} />
          {phone && <LeadActionBar lead={lead.data} onNote={toNote} />}
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
