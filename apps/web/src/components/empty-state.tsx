// What a list shows when it has nothing (DESIGN.md section 6): what belongs here, one way to add it, never a blank.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, message, action }: { icon: LucideIcon; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <Icon aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
      <p className="max-w-[40ch] text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
