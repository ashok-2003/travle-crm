"use client";

// One person's or one record's export and erasure (spec 5, DPDP; ADR 0023), on a request the organization passes on:
// export what it keeps about them (handed over at once, and logged; an erasure needs it from the last day), then
// erase them with the organization's code typed. The erasure's result comes from the platform log. The request is the
// section's, so what follows it doesn't depend on the dialog still being open.
import type { ErasureSubject } from "@travel-crm/contracts/platform";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RefusalAlert } from "@/components/refusal-alert";
import { useConsoleTRPC } from "../data/console-trpc";
import { ErasureDialog } from "./erasure-dialog";
import { askedNow, useJobOutcome } from "./job-outcome";
import { JobStatus } from "./job-status";
import { SubjectExportView } from "./subject-export-view";
import { SubjectForm } from "./subject-form";

const SKIP_REASONS = ["organization-gone", "no-recent-export", "unknown"] as const;

const recordIdOf = (subject: ErasureSubject) => (subject.kind === "member" ? subject.memberId : subject.recordId);

export function SubjectSection({ organization }: { organization: { id: string; code: string } }) {
  const t = useTranslations("consolePlatform.dataProtection.subject");
  const trpc = useConsoleTRPC();
  const exportSubject = useMutation(trpc.dataProtection.exportSubject.mutationOptions());
  const [erasing, setErasing] = useState<ErasureSubject | null>(null);
  const [requested, setRequested] = useState<{ subject: ErasureSubject; since: number } | null>(null);
  const erase = useMutation(
    trpc.dataProtection.requestErasure.mutationOptions({
      onSuccess: (_job, { subject }) => {
        setRequested({ subject, since: askedNow() });
        setErasing(null);
      },
    }),
  );
  const { outcome, gaveUp } = useJobOutcome({
    organizationId: organization.id,
    requested: "subject.erasure-requested",
    results: ["subject.erased", "subject.erasure-skipped"],
    ...(requested === null ? {} : { targetId: recordIdOf(requested.subject) }),
    since: requested?.since ?? null,
  });

  let result: string | null = null;
  if (outcome?.action === "subject.erased") result = t("erased");
  else if (outcome) {
    const reason = SKIP_REASONS.find((known) => known === outcome.after?.reason) ?? "unknown";
    result = t(`skipped.${reason}`);
  }

  return (
    <section aria-labelledby="subject-erasure" className="flex flex-col gap-4">
      <div className="flex max-w-[65ch] flex-col gap-1">
        <h2 id="subject-erasure" className="text-section font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>
      <SubjectForm
        busy={exportSubject.isPending}
        exported={exportSubject.isSuccess ? exportSubject.variables.subject : null}
        onExport={(subject) => {
          exportSubject.mutate({ organizationId: organization.id, subject });
        }}
        onErase={setErasing}
      />
      <RefusalAlert error={exportSubject.error} />
      {exportSubject.data && <SubjectExportView exported={exportSubject.data} />}
      {requested !== null && <JobStatus result={result} queued={t("queued")} gaveUp={gaveUp} />}
      {erasing !== null && (
        <ErasureDialog
          code={organization.code}
          open
          onOpenChange={(open) => {
            if (!open) setErasing(null);
          }}
          request={erase}
          onConfirm={(confirmation) => {
            erase.mutate({ organizationId: organization.id, subject: erasing, confirmation });
          }}
        />
      )}
    </section>
  );
}
