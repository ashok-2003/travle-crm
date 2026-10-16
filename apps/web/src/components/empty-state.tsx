// What a list shows when it has nothing (DESIGN.md section 6): what belongs here, one way to add it, never a blank. The
// registry's Empty. `standalone` is for a page of its own outside the shell (a gate's): centred in the window.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

export function EmptyState({
  icon: Icon,
  message,
  action,
  standalone = false,
}: {
  icon: LucideIcon;
  message: string;
  action?: ReactNode;
  standalone?: boolean;
}) {
  const empty = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia>
          <Icon aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
        </EmptyMedia>
        <EmptyDescription>{message}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
  return standalone ? <main className="flex min-h-dvh items-center justify-center px-4">{empty}</main> : empty;
}
