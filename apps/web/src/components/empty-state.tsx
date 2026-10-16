// What a list shows when it has nothing (DESIGN.md section 6): what belongs here, one way to add it, never a blank. The
// registry's Empty.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

export function EmptyState({ icon: Icon, message, action }: { icon: LucideIcon; message: string; action?: ReactNode }) {
  return (
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
}
