// A plain text link between the account screens ("Forgot your password?", "Back to sign in"), 44px tall so it is a
// touch target like any other (DESIGN.md section 4), however short its text.
import Link from "next/link";
import type { ReactNode } from "react";

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center self-start text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
