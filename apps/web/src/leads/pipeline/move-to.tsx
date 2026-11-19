"use client";

// A pipeline card's Move to, the way to change its stage from the keyboard and on a phone: its icon in the card's
// corner opens a menu of the other stages on a wider screen, and on a phone a bottom sheet (the registry Sheet) with
// them as 44px buttons, in reach of a thumb. Either way the move is instant (use-move-lead.tsx).
import { leadStages, type LeadListItem, type LeadStage } from "@travel-crm/contracts/crm";
import { ArrowRightLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
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

export function MoveTo({
  lead,
  wide,
  onMove,
}: {
  lead: Pick<LeadListItem, "id" | "person" | "stage">;
  wide: boolean;
  onMove: (lead: DraggedLead, stage: LeadStage) => void;
}) {
  const t = useTranslations("leads");
  const write = useWriteAccess("change");
  const [open, setOpen] = useState(false);
  const title = t("pipeline.moveTo", { name: lead.person.name });
  const others = leadStages.filter((stage) => stage !== lead.stage);
  const move = (stage: LeadStage) => {
    onMove({ id: lead.id, name: lead.person.name }, stage);
  };
  const Shape = wide ? IconButton : GlyphButton;
  const button = (
    <Shape
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
        <DropdownMenuContent align="end">
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
      <SheetContent side="bottom" aria-describedby={undefined} className="pb-[max(1rem,env(safe-area-inset-bottom))]">
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
