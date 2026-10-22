// /embed/<key>: the enquiry form for an iframe on the agency's own site. It has no background of its own, so it takes the
// look of the page around it, and is never indexed.
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EmbeddedFormLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{"body{background:transparent}"}</style>
      {children}
    </>
  );
}
