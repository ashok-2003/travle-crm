"use client";

// A lead's Next follow-up card (spec 3.4, R50): every open follow-up and task on the lead, earliest due first, each
// with when it is due in the list's own words and colours (NextStep) and Done and Snooze (TaskActions); "None set."
// when there is none. Add follow-up is for whoever can edit the lead.
import type { LeadDetail } from "@travel-crm/contracts/crm";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { useHolds, useMe } from "@/session/me-context";
import { TaskActions } from "@/tasks/task-actions";
import { NextStep } from "../next-step";
import { AddFollowUpDialog } from "./add-follow-up-dialog";
import { ChangeButton, LeadCard } from "./lead-card";
import { useReturnFocus } from "./use-return-focus";

export function WorkCard({ lead }: { lead: LeadDetail }) {
  const t = useTranslations("leads.lead.work");
  const { timeZone } = useMe().organization;
  const canEdit = useHolds("leads:edit");
  const [adding, setAdding] = useState(false);
  const { ref: opener, returnFocus } = useReturnFocus();
  const show = (open: boolean) => {
    setAdding(open);
    if (!open) returnFocus();
  };
  return (
    <LeadCard
      title={t("title")}
      action={
        canEdit && (
          <ChangeButton
            label={t("add")}
            ref={opener}
            onClick={() => {
              show(true);
            }}
          />
        )
      }
    >
      {lead.work.length === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <ItemGroup aria-label={t("title")}>
          {lead.work.map((work, index) => (
            <Fragment key={work.id}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem" className="px-0">
                <ItemContent>
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
      )}
      {canEdit && <AddFollowUpDialog leadId={lead.id} dialog={{ open: adding, setOpen: show }} />}
    </LeadCard>
  );
}
