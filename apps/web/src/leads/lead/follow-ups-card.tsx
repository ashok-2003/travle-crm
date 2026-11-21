"use client";

// A lead's Follow-ups card (spec 3.4, R50; the lead page's revamp, 2026-11-21): what to do now and what happened last, in
// one place. Every open follow-up and task on the lead, earliest due first, each with when it is due in the list's own
// words and colours (NextStep: red once overdue) and Done and Snooze (TaskActions), "None set." when there is none; then
// the last contact in a line (the newest call or WhatsApp message), and the automatic follow-ups with Start or Stop
// (sales). Add follow-up is for whoever can edit the lead.
import { isOpenStage, type LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { Fragment, useRef, useState } from "react";
import { Details, type Detail } from "@/components/details";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useAutomaticFollowUps } from "@/sales/lead-sales";
import { useHolds, useMe } from "@/session/me-context";
import { TaskActions } from "@/tasks/task-actions";
import { NextStep } from "../next-step";
import { AddFollowUpDialog } from "./add-follow-up-dialog";
import { useLastContact } from "./last-contact";
import { ChangeButton, LeadCard } from "./lead-card";

function OpenWork({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads.lead.work");
  const { timeZone } = useMe().organization;
  if (lead.work.length === 0) return <p className="text-muted-foreground">{t("none")}</p>;
  return (
    <ItemGroup aria-label={t("title")}>
      {lead.work.map((work, index) => (
        <Fragment key={work.id}>
          {index > 0 && <ItemSeparator />}
          <Item size="sm" role="listitem">
            {/* At least 12rem for what to do, so on a phone Done and Snooze go under it rather than squeeze it. */}
            <ItemContent className="min-w-48">
              <ItemTitle>
                <h3 className="script-leading">{work.title}</h3>
              </ItemTitle>
              <ItemDescription>
                <span className="text-label">
                  <NextStep next={{ awaitingReplySince: null, task: work }} timeZone={timeZone} />
                </span>
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <TaskActions task={work} />
            </ItemActions>
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  );
}

export function FollowUpsCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads.lead");
  const canEdit = useHolds("leads:edit");
  const [adding, setAdding] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const lastContact = useLastContact(lead.id);
  const automatic = useAutomaticFollowUps(lead.id, isOpenStage(lead.stage));
  const rows: Detail[] = [
    ...(lastContact === undefined
      ? []
      : [
          {
            label: t("followUps.lastContact"),
            value: <span className="line-clamp-2 script-leading">{lastContact ?? t("followUps.none")}</span>,
          },
        ]),
    ...(automatic === null ? [] : [automatic]),
  ];
  return (
    <LeadCard
      title={t("followUps.title")}
      action={
        canEdit && (
          <ChangeButton
            label={t("work.add")}
            ref={opener}
            onClick={() => {
              setAdding(true);
            }}
          />
        )
      }
    >
      <OpenWork lead={lead} />
      {rows.length > 0 && (
        <>
          <Separator />
          <Details rows={rows} />
        </>
      )}
      {canEdit && (
        <AddFollowUpDialog leadId={lead.id} dialog={{ open: adding, setOpen: setAdding }} returnFocusTo={opener} />
      )}
    </LeadCard>
  );
}
