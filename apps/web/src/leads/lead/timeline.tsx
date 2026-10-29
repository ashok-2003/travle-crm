"use client";

// A lead's timeline (spec 3.4): Add a note at the top for whoever can edit the lead, then what happened, newest first,
// a page at a time (leads.timeline, data/use-cursor-pages.ts), each entry as its sentence. Its pages are keyed under
// the procedure's path, so a change anywhere (a note, a follow-up done in Today) loads them again. Loading shows
// skeleton rows; a failure says so with Try again.
import type { LeadDetail, PeopleNames } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { ItemGroup, ItemSeparator } from "@/components/ui/item";
import { useTRPC, useTRPCClient } from "@/data/trpc";
import { useCursorPages } from "@/data/use-cursor-pages";
import { useHolds } from "@/session/me-context";
import { LeadCard } from "./lead-card";
import { NoteComposer } from "./note-composer";
import { TimelineEntryItem } from "./timeline-entry";

function useTimeline(leadId: string) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const pages = useCursorPages({
    queryKey: [...trpc.leads.timeline.pathKey(), { leadId }],
    page: (cursor) => client.leads.timeline.query({ leadId, ...(cursor !== null && { before: cursor }) }),
    items: (page) => page.entries,
  });
  const people = (pages.data?.pages ?? []).reduce<PeopleNames>((names, page) => ({ ...names, ...page.people }), {});
  return { ...pages, people };
}

export function Timeline({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads.lead.timeline");
  const tCommon = useTranslations("common");
  const canEdit = useHolds("leads:edit");
  const timeline = useTimeline(lead.id);

  const entries = (): ReactNode => {
    if (timeline.items === undefined) {
      return timeline.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={timeline.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void timeline.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" rows={3} label={t("loading")} />
      );
    }
    return (
      <>
        <ItemGroup aria-label={t("title")}>
          {timeline.items.map((entry, index) => (
            <Fragment key={entry.id}>
              {index > 0 && <ItemSeparator />}
              <TimelineEntryItem entry={entry} people={timeline.people} leadId={lead.id} />
            </Fragment>
          ))}
        </ItemGroup>
        {timeline.isFetchNextPageError && <RefusalAlert error={timeline.error} />}
        <ShowMoreButton pages={timeline} label={t("showMore")} />
      </>
    );
  };

  return (
    <LeadCard title={t("title")}>
      {canEdit && <NoteComposer leadId={lead.id} />}
      {entries()}
    </LeadCard>
  );
}
