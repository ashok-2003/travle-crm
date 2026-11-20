"use client";

// A work table's Customer cell (web revamp part 2): the person's name, leading to their lead when there is one, with
// the lead's stage under it to scan by. In a table the link sits inline; on a phone, where the rows stack, it keeps
// its 44px touch target.
import type { LeadStage } from "@travel-crm/contracts/crm";
import { TextLink } from "@/components/text-link";
import { StageBadge } from "@/leads/stage-badge";
import { useWideScreen } from "@/lib/use-wide-screen";

export function CustomerCell({ name, href, stage }: { name: string; href?: string; stage?: LeadStage }) {
  const wide = useWideScreen();
  return (
    <div className="flex flex-col items-start gap-1">
      {href === undefined ? (
        <span className="font-medium script-leading">{name}</span>
      ) : (
        <TextLink inline={wide} href={href}>
          <span className="script-leading">{name}</span>
        </TextLink>
      )}
      {stage !== undefined && <StageBadge stage={stage} />}
    </div>
  );
}
