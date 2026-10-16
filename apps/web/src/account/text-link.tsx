// A plain text link between the account screens ("Forgot your password?", "Back to sign in"): the registry's link
// Button, 44px tall so it is a touch target like any other (DESIGN.md section 4), however short its text.
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
