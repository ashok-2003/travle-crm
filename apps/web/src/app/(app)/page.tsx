"use client";

// The home screen. Business modules (leads, quotes, bookings) arrive in later steps; until then it points those who
// can set the organization up at what to do first: the Owner at the setup checklist until it is done (spec 7.1),
// everyone else (and the Owner afterwards) at the screens their role may use.
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HomeChecklist } from "@/business/setup/home-checklist";
import { PageTitle } from "@/components/page-title";
import { useMe } from "@/session/me-context";
import type { NavigationItem } from "@/shell/navigation";
import { useNavigationItems } from "@/shell/use-navigation-items";

/** The destinations that set the organization up: not home, nor the audit log, which looks back. */
type SetUpItem = NavigationItem & { key: Exclude<NavigationItem["key"], "home" | "audit"> };

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const setUp = useNavigationItems().filter((item): item is SetUpItem => item.key !== "home" && item.key !== "audit");
  const screens =
    setUp.length > 0 ? (
      <section className="flex flex-col gap-3">
        <p className="text-muted-foreground">{t("intro", { organization: me.organization.name })}</p>
        <ul className="divide-y rounded-lg border">
          {setUp.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent">
                <item.icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <span className="flex-1">{t(item.key)}</span>
                <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : (
      <p className="text-muted-foreground">{t("nothingToSetUp")}</p>
    );
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title", { name: me.user.name })}</PageTitle>
      {me.member.role.isOwner ? <HomeChecklist afterwards={screens} /> : screens}
    </div>
  );
}
