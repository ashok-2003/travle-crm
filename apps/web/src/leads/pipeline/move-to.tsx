"use client";

// A pipeline card's Move to, the way to change its stage from the keyboard and on a phone: its icon in the card's
// corner opens a menu of the other stages on a wider screen, and on a phone a bottom sheet (the registry Sheet) with
// them as 44px buttons, in reach of a thumb. Either way the move is instant (use-move-lead.tsx). A choice made from
// the keyboard says the stage the card left, so the board can keep the focus (pipeline-screen.tsx); the menu and the
// sheet then don't hand it back to this button, which moves with its card.
import { leadStages, type LeadListItem, type LeadStage } from "@travel-crm/contracts/crm";
import { ArrowRightLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type RefObject } from "react";
import { GlyphButton, IconButton } from "@/components/icon-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useWriteAccess } from "@/subscription/write-access";
import { StageDot } from "../stage-badge";
import type { DraggedLead } from "./dragged-lead";

/** The id of the board's hint saying why the subscription refuses moves (pipeline-screen.tsx). */
export const WRITE_HINT_ID = "pipeline-write-hint";

/** A move: the lead and its new stage, and for one chosen from the keyboard, the stage it left. */
export type OnMove = (lead: DraggedLead, stage: LeadStage, fromKeyboard?: { left: LeadStage }) => void;

/** Where the board puts the focus after a move from the keyboard: the card's Move to, or a column itself. */
export interface FocusAfterMove {
  leadId: string;
  column: LeadStage;
  on: "card" | "column";
}

/**
 * Focuses `target` when `take` is set, a task later (once the menu or sheet that made the move has closed and no longer
 * holds the focus), then calls `take`.
 */
export function useTakeFocus(take: (() => void) | null, target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!take) return;
    const later = setTimeout(() => {
      target.current?.focus();
      take();
    }, 0);
    return () => {
      clearTimeout(later);
    };
  }, [take, target]);
}

export function MoveTo({
  lead,
  wide,
  focus,
  onMove,
}: {
  lead: Pick<LeadListItem, "id" | "person" | "stage">;
  wide: boolean;
  /** Set when the board wants the focus here (the card just moved here from the keyboard); called once it has it. */
  focus: (() => void) | null;
  onMove: OnMove;
}) {
  const t = useTranslations("leads");
  const write = useWriteAccess("change");
  const [open, setOpen] = useState(false);
  const self = useRef<HTMLButtonElement>(null);
  /** Whether the last thing done in the menu or sheet was a key, and whether a stage was chosen there. */
  const keyboard = useRef(false);
  const chosen = useRef(false);
  useTakeFocus(focus, self);
  const title = t("pipeline.moveTo", { name: lead.person.name });
  const others = leadStages.filter((stage) => stage !== lead.stage);
  const move = (stage: LeadStage) => {
    chosen.current = true;
    onMove({ id: lead.id, name: lead.person.name }, stage, keyboard.current ? { left: lead.stage } : undefined);
  };
  /** What the menu and the sheet share: how the choice is made (seen before the choice itself, so on the way down),
   * and no focus handed back to a button that moved. */
  const choosing = {
    onKeyDownCapture: () => {
      keyboard.current = true;
    },
    onPointerDownCapture: () => {
      keyboard.current = false;
    },
    onCloseAutoFocus: (event: Event) => {
      if (chosen.current) event.preventDefault();
      chosen.current = false;
    },
  };
  const Shape = wide ? IconButton : GlyphButton;
  const button = (
    <Shape
      ref={self}
      variant="ghost"
      disabled={!write.allowed}
      aria-describedby={write.allowed ? undefined : WRITE_HINT_ID}
      aria-label={title}
    >
      <ArrowRightLeftIcon aria-hidden="true" />
    </Shape>
  );
  if (wide) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" {...choosing}>
          <DropdownMenuLabel>{title}</DropdownMenuLabel>
          {others.map((stage) => (
            <DropdownMenuItem
              key={stage}
              onSelect={() => {
                move(stage);
              }}
            >
              <StageDot stage={stage} />
              {t(`stages.${stage}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{button}</SheetTrigger>
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="pb-[max(1rem,env(safe-area-inset-bottom))]"
        {...choosing}
      >
        {/* Clear of the sheet's Close in the corner; a long name wraps. */}
        <SheetHeader className="pe-12">
          <SheetTitle className="wrap-anywhere">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-2">
          {others.map((stage) => (
            <Button
              key={stage}
              variant="quiet"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                move(stage);
              }}
            >
              <StageDot stage={stage} />
              {t(`stages.${stage}`)}
            </Button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
