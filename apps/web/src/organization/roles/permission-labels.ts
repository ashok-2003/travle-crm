"use client";

// Names for modules and permissions, from the roles messages. A permission added to the catalog before its words
// shows its key ("leads:export") rather than nothing.
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import roles from "@/i18n/messages/en-IN/roles.json";

type Permission = keyof typeof roles.permissions;
type Module = keyof typeof roles.modules;

const isPermission = (value: string): value is Permission => Object.hasOwn(roles.permissions, value);
const isModule = (value: string): value is Module => Object.hasOwn(roles.modules, value);

export function usePermissionLabels() {
  const t = useTranslations("roles");
  const permission = useCallback((key: string) => (isPermission(key) ? t(`permissions.${key}`) : key), [t]);
  const moduleName = useCallback((key: string) => (isModule(key) ? t(`modules.${key}`) : key), [t]);
  return { permission, moduleName };
}
