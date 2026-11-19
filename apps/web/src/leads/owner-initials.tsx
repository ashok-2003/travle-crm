"use client";

// A lead's owner as their initials in the people violet (DESIGN.md: assignee avatars), the registry Avatar, where a
// badge with the whole name would crowd the row (the pipeline's cards in Everyone's view): the name is there for
// screen readers, and in a tooltip on hover. A name the page didn't carry is a former member's.
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { initialsOf } from "@/inbox/chat-avatar";

export function OwnerInitials({ name }: { name: string | null }) {
  const t = useTranslations("leads");
  const shown = name ?? t("formerMember");
  const words = t("pipeline.ownedBy", { name: shown });
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar size="sm">
            <AvatarFallback className="bg-people-tint font-semibold text-people-tint-ink">
              <span aria-hidden="true">{initialsOf(shown)}</span>
              <span className="sr-only">{words}</span>
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>{words}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
