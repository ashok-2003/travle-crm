// A text link: the registry's link Button. On its own ("Forgot your password?", a name in a list) it is a 44px touch
// target however short its text (DESIGN.md section 4), and wraps however long, so a long organization or file name
// never runs past its row. `inline` is for a link inside a sentence, a log row or a desktop table cell: no 44px floor,
// sitting on the text's baseline. BackLink is the way back to the screen a page was opened from, with an arrow, top
// left as on every screen a list leads to.
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TextLink({ href, inline = false, children }: { href: string; inline?: boolean; children: ReactNode }) {
  return (
    <Button
      variant="link"
      className={cn("h-auto px-0 text-left whitespace-normal", inline ? "py-0 align-baseline" : "min-h-11 self-start")}
      asChild
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <TextLink href={href}>
      <ArrowLeftIcon aria-hidden="true" />
      {label}
    </TextLink>
  );
}
