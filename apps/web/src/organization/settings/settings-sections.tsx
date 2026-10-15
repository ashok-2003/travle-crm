"use client";

// The settings screen's way to the organization's other settings: each section shown to the roles that may use it
// (spec 11: navigation follows the caller's permissions). Hiding is a convenience; the api refuses the rest.
import {
  BuildingIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  HistoryIcon,
  PaletteIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { holds, useMe } from "@/session/me-context";

interface Section {
  /** Also the message key in "settings.sections", with its hint at `${key}Hint`. */
  key: "profile" | "branding" | "files" | "documents" | "audit";
  href: string;
  icon: LucideIcon;
  requires: string;
}

const sections: readonly Section[] = [
  { key: "profile", href: routes.profile, icon: BuildingIcon, requires: "settings:manage" },
  { key: "branding", href: routes.branding, icon: PaletteIcon, requires: "settings:manage" },
  { key: "files", href: routes.files, icon: FolderIcon, requires: "settings:manage" },
  { key: "documents", href: routes.documents, icon: FileTextIcon, requires: "settings:manage" },
  { key: "audit", href: routes.audit, icon: HistoryIcon, requires: "audit:view" },
];

export function SettingsSections() {
  const t = useTranslations("settings.sections");
  const me = useMe();
  const shown = sections.filter((section) => holds(me, section.requires));
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="sections-heading" className="flex flex-col gap-3">
      <h2 id="sections-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <ul className="divide-y rounded-lg border">
        {shown.map((section) => (
          <li key={section.key}>
            <Link href={section.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent">
              <section.icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{t(section.key)}</span>
                <span className="text-label text-muted-foreground">{t(`${section.key}Hint`)}</span>
              </span>
              <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
