"use client";

// A lead's timeline (spec 3.4; the lead page's revamp, 2026-11-21): small filters on top (All, AI, Calls & chats), Add a
// note for whoever can edit the lead, then what happened, newest first, a page at a time (use-timeline.ts), grouped
// under its days (Today, Yesterday, 6 Nov), each entry a compact row read by its colour (timeline-entry.tsx). On a
// computer (`boxed`) it fills its column and its entries scroll inside their own box, so the history never pushes the
// page; in one column (`firstShown`) the newest few show, then Show more. Loading shows skeleton rows; a failure says so
// with Try again.
import type { LeadDetail, TimelineEntry } from "@travel-crm/contracts/crm";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode, type Ref } from "react";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ShowMoreButton } from "@/components/show-more-button";
import { Button } from "@/components/ui/button";
import { ItemGroup } from "@/components/ui/item";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCalendarDay } from "@/lib/format";
import { useHolds, useMe } from "@/session/me-context";
import { LeadCard } from "./lead-card";
import { NoteComposer } from "./note-composer";
import { byAi, isCallOrChat, TimelineEntryItem } from "./timeline-entry";
import { useTimeline } from "./use-timeline";

const filters = ["all", "ai", "callsAndChats"] as const;
type Filter = (typeof filters)[number];

const kept: Record<Filter, (entry: TimelineEntry) => boolean> = {
  all: () => true,
  ai: byAi,
  callsAndChats: isCallOrChat,
};

/** Entries in a row under their day, as the agency's clocks see it, newest day first. */
function byDay(entries: TimelineEntry[], timeZone: string): { day: string; entries: TimelineEntry[] }[] {
  const days: { day: string; entries: TimelineEntry[] }[] = [];
  for (const entry of entries) {
    const day = calendarDateIn(new Date(entry.occurredAt), timeZone);
    const last = days.at(-1);
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

function Day({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-1">
      <h3 id={id} className="text-label font-medium text-muted-foreground">
        {heading}
      </h3>
      <ItemGroup aria-label={heading} className="gap-0.5 has-data-[size=sm]:gap-0.5">
        {children}
      </ItemGroup>
    </section>
  );
}

export function Timeline({
  lead,
  boxed = false,
  firstShown,
  noteRef,
}: {
  lead: LeadDetail;
  /** It fills its column, its entries scrolling in their own box (a computer's sticky column). */
  boxed?: boolean;
  /** Only the newest so many until Show more (one column). */
  firstShown?: number;
  /** The note box's form, for the phone's Note button. */
  noteRef?: Ref<HTMLFormElement>;
}) {
  const t = useTranslations("leads.lead.timeline");
  const tCommon = useTranslations("common");
  const canEdit = useHolds("leads:edit");
  const { timeZone } = useMe().organization;
  const timeline = useTimeline(lead.id);
  const [filter, setFilter] = useState<Filter>("all");
  const [all, setAll] = useState(false);

  const today = calendarDateIn(new Date(), timeZone);
  const dayWords = (day: string) => {
    if (day === today) return t("today");
    if (day === addDays(today, -1)) return t("yesterday");
    return formatCalendarDay(day);
  };

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
    const chosen = timeline.items.filter(kept[filter]);
    const capped = !all && firstShown !== undefined && chosen.length > firstShown;
    const shown = capped ? chosen.slice(0, firstShown) : chosen;
    return (
      <>
        {shown.length === 0 && filter !== "all" && <p className="text-muted-foreground">{t("noneShown")}</p>}
        {byDay(shown, timeZone).map(({ day, entries: ofDay }) => (
          <Day key={day} heading={dayWords(day)}>
            {ofDay.map((entry) => (
              <TimelineEntryItem key={entry.id} entry={entry} people={timeline.people} leadId={lead.id} />
            ))}
          </Day>
        ))}
        {capped ? (
          <Button
            variant="outline"
            className="self-center"
            onClick={() => {
              setAll(true);
            }}
          >
            {t("showFirst")}
          </Button>
        ) : (
          <>
            {timeline.isFetchNextPageError && <RefusalAlert error={timeline.error} />}
            <ShowMoreButton pages={timeline} label={t("showMore")} />
          </>
        )}
      </>
    );
  };

  return (
    <LeadCard title={t("title")} fill={boxed}>
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={t("filters.label")}
        value={filter}
        onValueChange={(value) => {
          // Pressing the chosen filter again keeps it: one is always chosen.
          const chosen = filters.find((each) => each === value);
          if (chosen !== undefined) setFilter(chosen);
        }}
        className="flex-wrap"
      >
        {filters.map((each) => (
          <ToggleGroupItem key={each} value={each}>
            {each === filter && <CheckIcon aria-hidden="true" />}
            {t(`filters.${each}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {canEdit && <NoteComposer leadId={lead.id} {...(noteRef !== undefined && { ref: noteRef })} />}
      {boxed ? (
        <div
          role="region"
          aria-label={t("entries")}
          // A box that scrolls is reached from the keyboard, to scroll it with the arrows.
          tabIndex={0}
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1"
        >
          {entries()}
        </div>
      ) : (
        <div className="flex flex-col gap-4">{entries()}</div>
      )}
    </LeadCard>
  );
}
