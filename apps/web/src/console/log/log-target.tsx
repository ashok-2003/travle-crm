"use client";

// What a platform log entry was about, readably: the organization it concerns, linked to its page by its name (or
// by the code the entry kept, once it is deleted), and the plan, person, job or record acted on.
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { consoleRoutes } from "../routes";
import { isNamedTarget } from "./log-actions";
import type { LogNames } from "./use-log-names";

/** A text field of either snapshot, e.g. the code an onboarding or a purge kept. */
function storedText(entry: PlatformLogEntry, field: string): string | null {
  const value = entry.after?.[field] ?? entry.before?.[field];
  return typeof value === "string" ? value : null;
}

export function LogOrganization({ entry, names }: { entry: PlatformLogEntry; names: LogNames }) {
  const t = useTranslations("consolePlatform.log");
  const organizationId = entry.targetOrganizationId;
  if (organizationId === null) return null;
  const code = storedText(entry, "code");
  const known = names.organization(organizationId);
  if (known.state === "deleted") {
    return <span>{code === null ? t("deletedOrganizationWithoutCode") : t("deletedOrganization", { code })}</span>;
  }
  return (
    <Link
      href={consoleRoutes.organization(organizationId)}
      className="text-primary underline-offset-4 script-leading hover:underline"
    >
      {known.state === "found" ? known.name : (code ?? t("organization"))}
    </Link>
  );
}

/** The thing acted on, when it isn't the organization itself; nothing for the policy, which is one of a kind. */
export function LogTarget({ entry, names }: { entry: PlatformLogEntry; names: LogNames }) {
  const t = useTranslations("consolePlatform.log");
  const { targetType, targetId } = entry;
  if (["organization", "subscription", "subscription_policy"].includes(targetType)) return null;
  let name: string | null;
  if (targetType === "plan") name = names.planName(targetId) ?? storedText(entry, "name") ?? storedText(entry, "key");
  else if (targetType === "platform_staff") name = names.personName(targetId);
  else if (targetType === "job") name = storedText(entry, "queue") ?? targetId;
  else name = targetId;
  // Support can't list platform staff: the action already says who was acted on.
  if (name === null) return null;
  return (
    <span>
      <span className="text-muted-foreground">
        {isNamedTarget(targetType) ? t(`targets.${targetType}`) : targetType}
      </span>{" "}
      <span
        className={targetType === "plan" || targetType === "platform_staff" ? "script-leading" : "numbers break-all"}
      >
        {name}
      </span>
    </span>
  );
}
