"use client";

// The way to the new-lead form (/leads/new), for whoever may add leads (leads:create, which the screen checks): the
// screen's one primary action. Adding is a change, so while the subscription refuses changes the button is off and
// says why (useWriteAccess).
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";

export function NewLeadButton() {
  const t = useTranslations("leads.list");
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
      <Button asChild>
        <Link href={routes.newLead}>{words}</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button disabled aria-describedby={hintId}>
        {words}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}
