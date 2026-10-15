"use client";

// Shows a screen only to members whose role holds its permission; others read why it isn't there. A convenience:
// the api refuses the screen's calls anyway (spec 6.5).
import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { useHolds } from "./me-context";

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const t = useTranslations("shell.session");
  return useHolds(permission) ? children : <EmptyState icon={LockIcon} message={t("noAccess")} />;
}
