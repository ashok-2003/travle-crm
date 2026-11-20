"use client";

// A row's action as its icon alone (web revamp part 2): the registry Button at `icon-sm` (32px to see, a 44px hit
// area), named by its aria-label, with the same words in the registry Tooltip on hover and focus (GlyphButton: none, for
// Call and WhatsApp). The row's main move
// (Done, Mark contacted) is `ghost`, blue; the rest `quiet`, ink. Rows set them 12px apart (gap-3), so hit areas never
// overlap. It takes a Button's props, so a screen can draw one button either way (`compact ? IconButton : Button`).
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "size"> & { "aria-label": string };

/** The icon alone with no tooltip, for a glyph everyone reads at once: Call's handset, WhatsApp's logo (owner). */
export function GlyphButton({ variant = "quiet", ...props }: IconButtonProps) {
  return <Button variant={variant} size="icon-sm" {...props} />;
}

export function IconButton(props: IconButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <GlyphButton {...props} />
        </TooltipTrigger>
        <TooltipContent>{props["aria-label"]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
