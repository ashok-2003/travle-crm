"use client";

// A lead's person (spec 3.4): their name and how to reach them, in labelled rows (Details), with Edit for whoever can
// edit the lead. Contacts they don't have are left out.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Details, type Detail } from "@/components/details";
import { formatPhoneNumber } from "@/lib/format";
import { useHolds } from "@/session/me-context";
import { EditPersonDialog } from "./edit-person-dialog";
import { ChangeButton, LeadCard } from "./lead-card";

export function PersonCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads");
  const canEdit = useHolds("leads:edit");
  const [editing, setEditing] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const { name, phone, email, instagramHandle } = lead.person;
  const rows: Detail[] = [
    { label: t("form.person.name"), value: <span className="script-leading">{name}</span> },
    ...(phone
      ? [{ label: t("form.person.phone"), value: <span className="numbers">{formatPhoneNumber(phone)}</span> }]
      : []),
    ...(email ? [{ label: t("form.person.email"), value: email }] : []),
    ...(instagramHandle ? [{ label: t("form.person.instagramHandle"), value: `@${instagramHandle}` }] : []),
  ];
  return (
    <LeadCard
      title={t("lead.person.title")}
      action={
        canEdit && (
          <ChangeButton
            label={t("lead.edit")}
            accessibleLabel={t("lead.person.edit")}
            ref={opener}
            onClick={() => {
              setEditing(true);
            }}
          />
        )
      }
    >
      <Details rows={rows} />
      {canEdit && (
        <EditPersonDialog lead={lead} dialog={{ open: editing, setOpen: setEditing }} returnFocusTo={opener} />
      )}
    </LeadCard>
  );
}
