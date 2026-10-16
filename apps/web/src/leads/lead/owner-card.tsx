"use client";

// A lead's owner and source (spec 3.4, R43): the owner as a violet badge (assignment is people information, never a
// button), with Reassign for leads:assign; then where the lead came from and who added it, its detail under it. A name
// the page didn't carry is a former member's; a lead with no owner is unassigned (release 4's queue).
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Details } from "@/components/details";
import { useHolds } from "@/session/me-context";
import { OwnerBadge } from "../owner-badge";
import { ChangeButton, LeadCard } from "./lead-card";
import { useReturnFocus } from "./use-return-focus";
import { ReassignDialog } from "./reassign-dialog";

export function OwnerCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const canAssign = useHolds("leads:assign");
  const [reassigning, setReassigning] = useState(false);
  const { ref: opener, returnFocus } = useReturnFocus();
  const show = (open: boolean) => {
    setReassigning(open);
    if (!open) returnFocus();
  };
  const nameOf = (userId: string) => lead.people[userId] ?? null;
  const source = t(`sources.${lead.source}`);
  const addedBy = lead.createdBy && (nameOf(lead.createdBy) ?? t("lead.owner.formerMember"));
  const reassign = canAssign && (
    <ChangeButton
      label={t("lead.owner.reassign")}
      ref={opener}
      onClick={() => {
        show(true);
      }}
    />
  );
  return (
    <LeadCard title={t("lead.owner.title")}>
      <Details
        rows={[
          {
            label: t("lead.owner.owner"),
            value:
              lead.ownerUserId === null ? (
                <span className="text-muted-foreground">{t("lead.owner.unassigned")}</span>
              ) : (
                <OwnerBadge name={nameOf(lead.ownerUserId)} />
              ),
            ...(reassign && { action: reassign }),
          },
          {
            label: t("lead.owner.source"),
            value: addedBy ? t("lead.owner.sourceBy", { source, name: addedBy }) : source,
            ...(lead.sourceDetail && { hint: lead.sourceDetail }),
          },
        ]}
      />
      {reassigning && <ReassignDialog lead={lead} open onOpenChange={show} />}
    </LeadCard>
  );
}
