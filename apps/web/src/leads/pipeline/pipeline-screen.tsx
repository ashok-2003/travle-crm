"use client";

// The pipeline (release C, web revamp part 4): every open lead in its stage's column, and the leads Won, newest first,
// a page at a time; managers switch between their own and everyone's. A lead moves by dragging its card to another
// column or with its Move to, at once (use-move-lead.tsx); the move is the lead page's own (leads.moveStage), so its
// timeline, audit and notices are the same. The five columns share the page's width, at least 260px each, and scroll
// sideways in their own box when the page is narrower. A phone (below 768px) shows the stages as chips with their
// counts, scrolling in their strip, and the chosen stage's cards under them, full width.
import { isOpenStage } from "@travel-crm/contracts/crm";
import { ListIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/lib/routes";
import { useWideScreen } from "@/lib/use-wide-screen";
import { useMe, viewScope } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { StageChipGroup } from "../list/stage-chips";
import { useLeadCounts } from "../list/use-leads";
import { boardStages, isBoardStage, type BoardStage, type BoardView } from "./board-cache";
import { WRITE_HINT_ID, type FocusAfterMove, type OnMove } from "./move-to";
import { StageColumn } from "./stage-column";
import { useMoveLead } from "./use-move-lead";

export function PipelineScreen() {
  const t = useTranslations("leads");
  const ownOnly = viewScope(useMe(), "leads:view") !== "all";
  const wide = useWideScreen();
  const [view, setView] = useState<BoardView>("mine");
  /** The stage a phone shows. */
  const [chosen, setChosen] = useState<BoardStage>("new");
  const counts = useLeadCounts({ view, stage: "open", limit: 25 });
  const write = useWriteAccess("change");
  const move = useMoveLead(view);
  const [focusAfterMove, setFocusAfterMove] = useState<FocusAfterMove | null>(null);
  const focused = useCallback(() => {
    setFocusAfterMove(null);
  }, []);
  const onMove = useCallback<OnMove>(
    (lead, stage, fromKeyboard) => {
      // A dropped card is refused here too: the api would refuse the move in a read-only agency.
      if (!write.allowed) return;
      if (!fromKeyboard) {
        move(lead, stage);
        return;
      }
      // A move from the keyboard keeps the focus on the board, never the page: on the card's Move to in its new
      // column, or on the column it left when it is no longer shown (Lost, Not a lead, another stage on a phone);
      // and when a refusal puts the card back, on its Move to there.
      const shown = wide && isBoardStage(stage);
      setFocusAfterMove({ leadId: lead.id, column: shown ? stage : fromKeyboard.left, on: shown ? "card" : "column" });
      move(lead, stage, () => {
        setFocusAfterMove({ leadId: lead.id, column: fromKeyboard.left, on: "card" });
      });
    },
    [write.allowed, move, wide],
  );
  const countOf = (stage: BoardStage) => (isOpenStage(stage) ? counts.data?.[stage] : undefined);
  const column = (stage: BoardStage) => (
    <StageColumn
      key={`${view}-${stage}`}
      stage={stage}
      view={view}
      wide={wide}
      count={countOf(stage)}
      focus={focusAfterMove?.column === stage ? focusAfterMove : null}
      onFocused={focused}
      onMove={onMove}
    />
  );
  const board = wide ? (
    <div
      role="region"
      aria-label={t("pipeline.board")}
      className="-mx-4 grid snap-x snap-mandatory scroll-px-4 grid-cols-[repeat(5,minmax(16.25rem,1fr))] gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:px-8"
    >
      {boardStages.map(column)}
    </div>
  ) : (
    <div role="region" aria-label={t("pipeline.board")} className="flex flex-col gap-4">
      {/* The chips scroll sideways in their own strip; the padding keeps their focus outline in view. */}
      <div className="-m-1 overflow-x-auto p-1">
        <StageChipGroup
          chips={boardStages}
          chosen={chosen}
          label={t("pipeline.stages")}
          words={(stage) => t(`stages.${stage}`)}
          count={countOf}
          onChoose={setChosen}
        />
      </div>
      {column(chosen)}
    </div>
  );
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("pipeline.title")}
        intro={wide ? t("pipeline.intro") : t("pipeline.introPhone")}
        action={
          <Button asChild variant="outline">
            <Link href={routes.leads}>
              <ListIcon aria-hidden="true" />
              {t("pipeline.toList")}
            </Link>
          </Button>
        }
      />
      <WriteHint id={WRITE_HINT_ID} hint={write.hint} />
      {ownOnly ? (
        board
      ) : (
        <Tabs
          value={view}
          onValueChange={(next) => {
            setView(next === "everyone" ? "everyone" : "mine");
          }}
          className="gap-6"
        >
          <TabsList aria-label={t("list.whose")}>
            <TabsTrigger value="mine">{t("list.mine")}</TabsTrigger>
            <TabsTrigger value="everyone">{t("list.everyone")}</TabsTrigger>
          </TabsList>
          {/* The tabs' panel, which their triggers name. */}
          <TabsContent value={view} className="text-base">
            {board}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
