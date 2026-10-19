"use client";

// The Staff header's actions (spec 3.1): Add staff stays the one primary button, with Import and Export beside it as
// outline pills, in one row that wraps. Import is a change, so while the subscription refuses changes it is off and
// says why; Export still works then (ADR 0021).
import type { RoleSummary } from "@travel-crm/contracts/identity";
import { UploadIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { CreateStaffDialog } from "./create-staff-dialog";
import { StaffExportButton } from "./export/staff-export-button";

function StaffImportButton() {
  const t = useTranslations("staff.header");
  const write = useWriteAccess("change");
  const hintId = useId();
  const words = (
    <>
      <UploadIcon aria-hidden="true" />
      {t("import")}
    </>
  );
  if (write.allowed) {
    return (
      <Button asChild variant="outline">
        <Link href={routes.staffImport}>{words}</Link>
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="outline" disabled aria-describedby={hintId}>
        {words}
      </Button>
      <WriteHint id={hintId} hint={write.hint} />
    </div>
  );
}

export function StaffHeaderActions({ roles, count }: { roles: RoleSummary[]; count: number }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      <CreateStaffDialog roles={roles} />
      <StaffImportButton />
      <StaffExportButton count={count} />
    </div>
  );
}
