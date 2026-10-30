"use client";

// Who is signed in to the console, and at which level, at the foot of the sidebar and atop the phone's More sheet.
import { useTranslations } from "next-intl";
import { useStaff } from "../session/staff-context";

/** `onLight`: atop the phone's More sheet, which is light, not the green sidebar. */
export function SignedInStaff({ onLight = false }: { onLight?: boolean }) {
  const t = useTranslations("console.levels");
  const staff = useStaff();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="font-medium break-words script-leading">{staff.name}</span>
      <span className={onLight ? "text-caption text-muted-foreground" : "text-caption text-sidebar-foreground"}>
        {t(staff.level)}
      </span>
    </span>
  );
}
