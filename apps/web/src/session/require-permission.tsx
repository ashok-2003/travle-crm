"use client";

// Shows a screen only to members whose role holds its permission; others read why it isn't there, with the way home.
// A convenience: the api refuses the screen's calls anyway (spec 6.5).
import { LockIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { useHolds } from "./me-context";

export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const t = useTranslations("shell.session");
  if (useHolds(permission)) return children;
  return (
    <EmptyState
      icon={LockIcon}
      message={t("noAccess")}
      action={
        <Button asChild>
          <Link href={routes.home}>{t("goHome")}</Link>
        </Button>
      }
    />
  );
}
