"use client";

// The audit log's words: each action's sentence (audit.json's actions), a readable one made from the action itself for
// an action recorded before its sentence was written, who acted, and where from.
import type { AuditActor, AuditSource } from "@travel-crm/contracts/audit";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import audit from "@/i18n/messages/en-IN/audit.json";

type Actions = typeof audit.actions;

/** "staff.removed", and every other action with a sentence. */
type KnownAction = { [Entity in keyof Actions]: `${Entity}.${keyof Actions[Entity] & string}` }[keyof Actions];

const isEntity = (value: string): value is keyof Actions => Object.hasOwn(audit.actions, value);

/** Whether the action ("<entity>.<what happened>") has its sentence. */
export function isKnownAction(action: string): action is KnownAction {
  const [entity = "", happened, ...rest] = action.split(".");
  return (
    isEntity(entity) && happened !== undefined && rest.length === 0 && Object.hasOwn(audit.actions[entity], happened)
  );
}

/** "share-link.revoked" reads "Share link revoked": an action recorded before its sentence was written. */
export function readableAction(action: string): string {
  const words = action
    .split(/[.-]+/)
    .filter((word) => word !== "")
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function useAuditWords() {
  const t = useTranslations("audit");

  const action = useCallback((key: string) => (isKnownAction(key) ? t(`actions.${key}`) : readableAction(key)), [t]);

  const actor = useCallback(
    (who: AuditActor): string => {
      switch (who.kind) {
        case "member":
          return who.name ?? t("actors.formerMember");
        case "support-as-member":
          return who.name === null ? t("actors.supportAsFormerMember") : t("actors.supportAs", { name: who.name });
        case "support":
          return t("actors.support");
        case "platform":
          return t("actors.platform");
        case "system":
          return t("actors.system");
      }
    },
    [t],
  );

  const source = useCallback((from: AuditSource) => t(`sources.${from}`), [t]);

  return { action, actor, source };
}
