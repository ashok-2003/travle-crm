"use client";

// A lead's owner and source (spec 3.4, R43): the owner as a violet badge (assignment is people information, never a
// button), with Reassign for leads:assign; then where the lead came from and who added it, its detail under it. A name
// the page didn't carry is a former member's; a lead with no owner is unassigned (release 4's queue). Both labels say
// what they mean (a lead's owner is not the Owner role; a source is a new word to some).
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Details } from "@/components/details";
import { useHolds } from "@/session/me-context";
import { OwnerBadge } from "../owner-badge";
import { ChangeButton, LeadCard } from "./lead-card";
import { ReassignDialog } from "./reassign-dialog";

export function OwnerCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const canAssign = useHolds("leads:assign");
  const [reassigning, setReassigning] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const nameOf = (userId: string) => lead.people[userId] ?? null;
  const source = t(`sources.${lead.source}`);
  const addedBy = lead.createdBy && (nameOf(lead.createdBy) ?? t("lead.owner.formerMember"));
  const reassign = canAssign && (
    <ChangeButton
      label={t("lead.owner.reassign")}
      ref={opener}
      onClick={() => {
        setReassigning(true);
      }}
    />
  );
  return (
    <LeadCard title={t("lead.owner.title")}>
      <Details
        rows={[
          {
            label: t("lead.owner.owner"),
            info: t("hints.owner"),
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
            info: t("hints.source"),
            value: addedBy ? t("lead.owner.sourceBy", { source, name: addedBy }) : source,
            ...(lead.sourceDetail && { hint: lead.sourceDetail }),
          },
        ]}
      />
      {reassigning && <ReassignDialog lead={lead} open onOpenChange={setReassigning} returnFocusTo={opener} />}
    </LeadCard>
  );
}
