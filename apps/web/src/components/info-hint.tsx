"use client";

// "What does this mean?" beside a term a first-time user may not know (DESIGN.md section 6, the info hint): a small ⓘ
// button, 20px to see with a 44px hit area, that shows a sentence or two. With a mouse it is the registry Tooltip, open
// on hover and on keyboard focus, and a click keeps it open where a tooltip would close; a touch screen can't hover,
// so there a tap opens the registry Popover. Either way the button is named by its question ("What does Returning
// mean?"), the words are announced with it, and Escape closes them.
import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/lib/use-media-query";

/** A mouse or a trackpad, which can hover. */
const hovers = "(hover: hover) and (pointer: fine)";

/** The page's phone gutter: the words never sit flush against the screen's edge. */
const EDGE_GAP = 16;

export function InfoHint({ term, children }: { term: string; children: ReactNode }) {
  const t = useTranslations("common");
  const canHover = useMediaQuery(hovers);
  const [open, setOpen] = useState(false);
  const wordsId = useId();
  const button = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("whatDoesItMean", { term })}
      className="relative size-5 align-middle after:absolute after:-inset-3"
    >
      <InfoIcon aria-hidden="true" />
    </Button>
  );
  if (canHover) {
    return (
      <TooltipProvider>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger
            asChild
            onPointerDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
          >
            {button}
          </TooltipTrigger>
          <TooltipContent collisionPadding={EDGE_GAP} className="text-pretty">
            {children}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent collisionPadding={EDGE_GAP} aria-label={term} aria-describedby={wordsId}>
        <p id={wordsId} className="text-pretty">
          {children}
        </p>
      </PopoverContent>
    </Popover>
  );
}
