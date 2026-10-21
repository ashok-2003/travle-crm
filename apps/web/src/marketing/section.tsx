// One part of the public page: an anchor the header's links jump to (clear of the header), its heading and an intro.
// One h1 per page is the hero's, so a part's heading is an h2.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MarketingSection({
  id,
  title,
  intro,
  className,
  children,
}: {
  id: string;
  title: string;
  intro?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20 py-12 md:py-16", className)}>
      <div className="mb-8 flex max-w-[65ch] flex-col gap-3">
        <h2 id={headingId} className="text-title-mobile font-semibold text-balance">
          {title}
        </h2>
        {intro !== undefined && <p className="text-pretty text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}
