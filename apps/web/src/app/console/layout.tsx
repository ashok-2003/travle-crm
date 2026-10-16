// Every console screen (spec 7, ADR 0019): the console's own data layer, the gate that lets platform staff in, then
// the console's frame around the page. Its pages are titled "<screen> · Console · <product>".
import { brand } from "@travel-crm/brand";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ConsoleProviders } from "@/console/data/console-providers";
import { ConsoleGate } from "@/console/session/console-gate";
import { ConsoleShell } from "@/console/shell/console-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("console");
  const consoleTitle = `${t("title")} · ${brand.productName}`;
  return { title: { default: consoleTitle, template: `%s · ${consoleTitle}` } };
}

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <ConsoleProviders>
      <ConsoleGate>
        <ConsoleShell>{children}</ConsoleShell>
      </ConsoleGate>
    </ConsoleProviders>
  );
}
