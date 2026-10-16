// A plain text link ("Forgot your password?", "Back to sign in"): the registry's link Button, 44px tall so it is a
// touch target like any other (DESIGN.md section 4), however short its text. BackLink is the way back to the screen a
// page was opened from, with an arrow, top left as on every screen a list leads to.
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="link" className="self-start px-0" asChild>
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
