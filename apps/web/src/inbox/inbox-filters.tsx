"use client";

// The filters above the chats (sales inbox spec, sections 3, 5 and design v2), as the sales inboxes teams know: one row of
// chips with their counts (All, Unread, Waiting with the late ones in red, Mine, Unassigned, Snoozed, Archived), and under
// it small choices: the lead's stage (each with how many chats stand there, the pipeline at a glance), how recent the
// last message is, a tag, and, once the agency has two WhatsApp numbers, the number. Every choice is kept in the tab,
// never the address. The chips' counts stay for every number, as they do for a tag.
import { leadStages, type LeadStage } from "@travel-crm/contracts/crm";
import {
  conversationPeriods,
  type ConversationFilter,
  type ConversationPeriod,
  type InboxSummary,
  type WhatsappNumber,
} from "@travel-crm/contracts/inbox";
import { SlidersHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StageDot } from "@/leads/stage-badge";
import { cn } from "@/lib/utils";
import { useTags } from "./use-inbox-tools";

export const inboxFilters = [
  "all",
  "unread",
  "waiting",
  "mine",
  "unassigned",
  "snoozed",
  "archived",
] as const satisfies readonly ConversationFilter[];
const filterLabel = {
  waiting: "filterWaiting",
  unread: "filterUnread",
  all: "filterAll",
  mine: "filterMine",
  unassigned: "filterUnassigned",
  snoozed: "filterSnoozed",
  archived: "filterArchived",
} as const;
/** "Any" in each choice: the Select needs a value of its own for it. */
export const ANY = "any";

const countOf = (summary: InboxSummary | undefined, value: ConversationFilter): number | null => {
  if (summary === undefined) return null;
  if (value === "waiting") return summary.waiting;
  if (value === "unread") return summary.unread;
  if (value === "mine") return summary.mine;
  if (value === "unassigned") return summary.unassigned;
  if (value === "snoozed") return summary.snoozed;
  return null;
};

export function FilterChips({
  value,
  onChange,
  summary,
}: {
  value: ConversationFilter;
  onChange: (filter: ConversationFilter) => void;
  summary: InboxSummary | undefined;
}) {
  const t = useTranslations("inbox");
  return (
    // One row that scrolls sideways on every screen, fading its right edge as the cue, so the chips take one line.
    <div className="-mx-3 overflow-x-auto px-3 mask-[linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label={t("filters")}
        value={value}
        onValueChange={(chosen) => {
          const found = inboxFilters.find((filter) => filter === chosen);
          if (found !== undefined) onChange(found);
        }}
        className="w-max pr-6"
      >
        {inboxFilters.map((filter) => {
          const count = countOf(summary, filter);
          const late = filter === "waiting" ? (summary?.late ?? 0) : 0;
          return (
            <ToggleGroupItem key={filter} value={filter} className="gap-1.5 rounded-full px-3">
              {t(filterLabel[filter])}{" "}
              {count !== null && count > 0 && (
                <span className={cn("numbers text-caption", late > 0 && "font-semibold text-status-bad-ink")}>
                  {count}
                </span>
              )}
              {late > 0 && <span className="sr-only">, {t("lateCount", { count: late })}</span>}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}

const pipelineStages = ["new", "contacted", "quote_sent", "booking_requested", "won"] as const;

export function FilterChoices({
  stage,
  onStage,
  period,
  onPeriod,
  tagId,
  onTag,
  number,
  summary,
}: {
  stage: LeadStage | null;
  onStage: (stage: LeadStage | null) => void;
  period: ConversationPeriod | null;
  onPeriod: (period: ConversationPeriod | null) => void;
  tagId: string | null;
  onTag: (tagId: string | null) => void;
  /** The Number choice, once the agency has two numbers: every number it has had, and the one chosen. */
  number: { numbers: WhatsappNumber[]; connectionId: string | null; onChange: (id: string | null) => void } | null;
  summary: InboxSummary | undefined;
}) {
  const t = useTranslations("inbox");
  const tStages = useTranslations("leads.stages");
  const tags = useTags();
  const stageCount = (value: LeadStage) =>
    summary === undefined || !(pipelineStages as readonly string[]).includes(value)
      ? null
      : summary.stages[value as (typeof pipelineStages)[number]];
  return (
    <div className="flex flex-col gap-3">
      <Select
        value={stage ?? ANY}
        onValueChange={(chosen) => {
          onStage(leadStages.find((candidate) => candidate === chosen) ?? null);
        }}
      >
        <SelectTrigger aria-label={t("stageFilter")} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("anyStage")}</SelectItem>
          {leadStages.map((value) => {
            const count = stageCount(value);
            return (
              <SelectItem key={value} value={value}>
                <StageDot stage={value} />
                {tStages(value)}
                {count !== null && <span className="numbers ml-auto pl-3 text-muted-foreground">{count}</span>}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Select
        value={period ?? ANY}
        onValueChange={(chosen) => {
          onPeriod(conversationPeriods.find((candidate) => candidate === chosen) ?? null);
        }}
      >
        <SelectTrigger aria-label={t("periodFilter")} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("anyTime")}</SelectItem>
          {conversationPeriods.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`periods.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={tagId ?? ANY}
        onValueChange={(chosen) => {
          onTag(chosen === ANY ? null : chosen);
        }}
      >
        <SelectTrigger aria-label={t("tagFilter")} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{t("anyTag")}</SelectItem>
          {(tags.data ?? []).map((tag) => (
            <SelectItem key={tag.id} value={tag.id}>
              {tag.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {number !== null && (
        <Select
          value={number.connectionId ?? ANY}
          onValueChange={(chosen) => {
            number.onChange(chosen === ANY ? null : chosen);
          }}
        >
          <SelectTrigger aria-label={t("numberFilter")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t("anyNumber")}</SelectItem>
            {number.numbers.map((one) => (
              <SelectItem key={one.id} value={one.id}>
                {one.status === "disconnected" ? t("disconnectedNumber", { label: one.label }) : one.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

type Choices = Parameters<typeof FilterChoices>[0];

/** The stage, time, tag and number choices behind one button that says how many are made (the Leads page's pattern). */
export function FiltersButton({ onClear, ...choices }: Choices & { onClear: () => void }) {
  const t = useTranslations("inbox");
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const chosen = [choices.stage, choices.period, choices.tagId, choices.number?.connectionId].filter(Boolean).length;
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        className="shrink-0"
        aria-label={chosen > 0 ? t("filtersChosen", { count: chosen }) : undefined}
        onClick={() => {
          setOpen(true);
        }}
      >
        <SlidersHorizontalIcon aria-hidden="true" />
        {t("filtersButton")}
        {chosen > 0 && <span className="numbers">{chosen}</span>}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        returnFocusTo={opener}
        title={t("filtersTitle")}
        description={t("filtersDescription")}
        cancel={false}
        footer={
          <>
            <Button variant="outline" disabled={chosen === 0} onClick={onClear}>
              {t("filtersClear")}
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
              }}
            >
              {t("filtersDone")}
            </Button>
          </>
        }
      >
        <FilterChoices {...choices} />
      </ResponsiveDialog>
    </>
  );
}
