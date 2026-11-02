// The frame of an agency's public pages (release 7b): a column on the canvas, the agency's colour set on the page's own parts
// (as the website form does), and the way to call or message the agency. Server-rendered; the enquiry form is a client part.
import type { PublicAgency } from "@travel-crm/contracts/package-pages";
import type { ReactNode } from "react";
import { colourStyle } from "@/website-form/colour-style";

export function PageFrame({ agency, children }: { agency: PublicAgency; children: ReactNode }) {
  return (
    <main style={colourStyle(agency.colour)} className="flex min-h-dvh justify-center px-4 py-6 md:py-10">
      <div className="flex w-full max-w-[960px] flex-col gap-8">{children}</div>
    </main>
  );
}
