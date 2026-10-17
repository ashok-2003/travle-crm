"use client";

// New lead, the way to the new-lead form (/leads/new), for whoever may add leads (leads:create, which the screen
// checks): Leads' one primary action, and on Home an outline button, so Open Today stays the main one there. Adding is
// a change, so while the subscription refuses changes the button is off and says why (useWriteAccess).
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function NewLeadButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const t = useTranslations("leads");
  const write = useWriteAccess("change");
  const hintId = useId();
  const words = (
    <>
      <PlusIcon aria-hidden="true" />
      {t("newLead")}
    </>
  );
  if (write.allowed) {
    return (
      <Button asChild variant={variant}>
        <Link href={routes.newLead}>{words}</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant={variant} disabled aria-describedby={hintId}>
        {words}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
