// A screen's one h1 (DESIGN.md section 3): EB Garamond, 24px on phones and 30px from tablets up. Never used for
// cards, dialogs or tables.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("font-title text-title-mobile font-medium tracking-[-0.01em] md:text-title", className)}>
      {children}
    </h1>
  );
}
