// A page that stands alone, outside the app's shell, with one thing to say: an icon, the page's Garamond title, one
// sentence and the ways on, centred (DESIGN.md: an empty state's shape). The offline page and the 404 are this.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { PageTitle } from "./page-title";

export function MessagePage({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  /** The ways on, the first one primary. */
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[40ch] flex-col items-center justify-center gap-4 px-4 text-center">
      <Icon aria-hidden="true" className="size-10 text-muted-foreground" strokeWidth={1.25} />
      <PageTitle>{title}</PageTitle>
      <p className="text-muted-foreground">{body}</p>
      <div className="flex flex-col items-center gap-3">{children}</div>
    </main>
  );
}
