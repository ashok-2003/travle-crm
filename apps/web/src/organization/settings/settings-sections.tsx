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
import { Fragment } from "react";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
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
      <ItemGroup>
        {shown.map((section, index) => (
          <Fragment key={section.key}>
            {index > 0 && <ItemSeparator />}
            <div role="listitem">
              <Item size="sm" asChild>
                <Link href={section.href}>
                  <ItemMedia variant="icon">
                    <section.icon aria-hidden="true" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{t(section.key)}</ItemTitle>
                    <ItemDescription>{t(`${section.key}Hint`)}</ItemDescription>
                  </ItemContent>
                  <ChevronRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </Item>
            </div>
          </Fragment>
        ))}
      </ItemGroup>
    </section>
  );
}
