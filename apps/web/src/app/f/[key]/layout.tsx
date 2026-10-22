// /f/<key>: the hosted enquiry form's layout. The page is never indexed.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function HostedFormLayout({ children }: { children: ReactNode }) {
  return children;
}
