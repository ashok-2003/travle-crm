// A screen's header (DESIGN.md section 3), one for every screen so its gaps and its action's place never differ: the
// screen's h1, an intro under it at gap-2, and the screen's one action, which sits under the intro on phones and at
// the right, level with the title, from tablets up.
import type { ReactNode } from "react";
import { PageTitle } from "./page-title";

export function PageHeader({ title, intro, action }: { title: ReactNode; intro?: ReactNode; action?: ReactNode }) {
  const heading = (
    <div className="flex max-w-[65ch] flex-col gap-2">
      <PageTitle>{title}</PageTitle>
      {intro !== undefined && <p className="text-muted-foreground">{intro}</p>}
    </div>
  );
  // A screen may hold its action back (while what it needs loads), as `cond && <Action />` does.
  if (action === undefined || action === null || action === false) return heading;
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-6">
      {heading}
      <div className="shrink-0">{action}</div>
    </div>
  );
}
