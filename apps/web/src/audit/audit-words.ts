"use client";

// The audit log's words: each action's sentence (audit.json's actions), a readable one made from the action itself for
// an action recorded before its sentence was written, who acted, and where from; and in a change, each known field's
// name, a permission's grant by its label and scope, a business profile's field by the form's own label, a record's
// type in words, and a recorded instant in the organization's zone. Anything else shows as stored. A field that only
// points at a record (its id) isn't shown at all: the entry's history link leads to the record.
import type { AuditActor, AuditLogEntry, AuditSource } from "@travel-crm/contracts/audit";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import audit from "@/i18n/messages/en-IN/audit.json";
import { formatDayTime } from "@/lib/format";
import { usePermissionLabels } from "@/organization/roles/permission-labels";
import { useMe } from "@/session/me-context";

type Actions = typeof audit.actions;

/** "staff.removed", and every other action with a sentence. */
type KnownAction = { [Entity in keyof Actions]: `${Entity}.${keyof Actions[Entity] & string}` }[keyof Actions];

const isEntity = (value: string): value is keyof Actions => Object.hasOwn(audit.actions, value);
const isKnownField = (value: string): value is keyof typeof audit.fields => Object.hasOwn(audit.fields, value);
const isKnownRecordType = (value: string): value is keyof typeof audit.recordTypes =>
  Object.hasOwn(audit.recordTypes, value);

/** A profile field's label in the form (business.profile): the GST state's is under its own name. */
const PROFILE_LABELS = {
  legalName: "legalName",
  gstin: "gstin",
  gstStateCode: "gstState",
  address: "address",
  contactName: "contactName",
  contactPhone: "contactPhone",
  bankAccountName: "bankAccountName",
  bankAccountNumber: "bankAccountNumber",
  bankIfsc: "bankIfsc",
  bankName: "bankName",
  invoicePrefix: "invoicePrefix",
} as const;
const isProfileField = (value: string): value is keyof typeof PROFILE_LABELS => Object.hasOwn(PROFILE_LABELS, value);

/** Fields that only point at a record, never shown as a change. */
const POINTERS: readonly string[] = ["recordId"];

/** A change's side without the fields that only point at a record. */
export function withoutPointers(snapshot: AuditLogEntry["before"]): AuditLogEntry["before"] {
  return snapshot && Object.fromEntries(Object.entries(snapshot).filter(([field]) => !POINTERS.includes(field)));
}

/** A role's grant as the roles module records it: { permission, scope }. */
function isGrant(value: unknown): value is { permission: string; scope: "own" | "all" | null } {
  return (
    value !== null && typeof value === "object" && typeof (value as { permission?: unknown }).permission === "string"
  );
}

/** An instant as recorded ("2026-10-16T09:30:00.000Z"), not a calendar day or any other text. */
const RECORDED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

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
  const tRoles = useTranslations("roles.editor");
  const tProfile = useTranslations("business.profile");
  const labels = usePermissionLabels();
  const { timeZone } = useMe().organization;

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

  const field = useCallback((key: string) => (isKnownField(key) ? t(`fields.${key}`) : key), [t]);

  const value = useCallback(
    (field: string, stored: unknown): string | undefined => {
      if (field === "fields" && typeof stored === "string") {
        return isProfileField(stored) ? tProfile(PROFILE_LABELS[stored]) : stored;
      }
      if (field === "recordType" && typeof stored === "string") {
        return isKnownRecordType(stored) ? t(`recordTypes.${stored}`) : readableAction(stored);
      }
      if (isGrant(stored)) {
        const name = labels.permission(stored.permission);
        if (stored.scope === null) return name;
        return `${name} (${stored.scope === "own" ? tRoles("scopeOwn") : tRoles("scopeAll")})`;
      }
      if (typeof stored === "string" && RECORDED_INSTANT.test(stored))
        return formatDayTime(new Date(stored), { timeZone });
      return undefined;
    },
    [t, labels, tRoles, tProfile, timeZone],
  );

  return { action, actor, source, field, value };
}
