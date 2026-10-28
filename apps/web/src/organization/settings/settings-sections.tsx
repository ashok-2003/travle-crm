"use client";

// The settings screen's way to the organization's other settings: each section shown to the roles that may use it
// (spec 11: navigation follows the caller's permissions), and a business module's only on a plan with it (R51:
// Destinations and Blocked contacts are crm's). Hiding is a convenience; the api refuses the rest.
import type { PlanModule } from "@travel-crm/contracts/subscriptions";
import {
  BanIcon,
  BuildingIcon,
  ChevronRightIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderIcon,
  HistoryIcon,
  IndianRupeeIcon,
  ListChecksIcon,
  MessageCircleIcon,
  MapPinIcon,
  PaletteIcon,
  ShuffleIcon,
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
import { isOnPlan } from "@/shell/navigation";
import { useSubscription } from "@/subscription/use-subscription";

interface Section {
  /** Also the message key in "settings.sections", with its hint at `${key}Hint`. */
  key:
    | "setup"
    | "profile"
    | "branding"
    | "files"
    | "documents"
    | "destinations"
    | "blockedContacts"
    | "leadSources"
    | "assignment"
    | "whatsapp"
    | "quotes"
    | "audit";
  href: string;
  icon: LucideIcon;
  /** Every permission it needs: Lead sources adds leads and reassigns them. */
  requires: string | readonly string[];
  /** The plan module it belongs to, if any (spec 7.2). */
  module?: PlanModule;
}

const sections: readonly Section[] = [
  { key: "setup", href: routes.setup, icon: ListChecksIcon, requires: "settings:manage" },
  { key: "profile", href: routes.profile, icon: BuildingIcon, requires: "settings:manage" },
  { key: "branding", href: routes.branding, icon: PaletteIcon, requires: "settings:manage" },
  { key: "files", href: routes.files, icon: FolderIcon, requires: "settings:manage" },
  { key: "documents", href: routes.documents, icon: FileTextIcon, requires: "settings:manage" },
  { key: "destinations", href: routes.destinations, icon: MapPinIcon, requires: "settings:manage", module: "crm" },
  { key: "blockedContacts", href: routes.blockedContacts, icon: BanIcon, requires: "leads:assign", module: "crm" },
  {
    key: "leadSources",
    href: routes.leadSources,
    icon: FileSpreadsheetIcon,
    requires: ["leads:create", "leads:assign"],
    module: "crm",
  },
  {
    key: "assignment",
    href: routes.leadAssignment,
    icon: ShuffleIcon,
    requires: ["settings:manage", "leads:assign"],
    module: "crm",
  },
  { key: "whatsapp", href: routes.whatsapp, icon: MessageCircleIcon, requires: "settings:manage", module: "inbox" },
  { key: "quotes", href: routes.quoteSettings, icon: IndianRupeeIcon, requires: "settings:manage", module: "quotes" },
  { key: "audit", href: routes.audit, icon: HistoryIcon, requires: "audit:view" },
];

export function SettingsSections() {
  const t = useTranslations("settings.sections");
  const me = useMe();
  const modules = useSubscription().data?.modules;
  const shown = sections.filter(
    (section) =>
      [section.requires].flat().every((permission) => holds(me, permission)) &&
      isOnPlan({ module: section.module ?? null }, modules),
  );
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
