"use client";

// The home screen. Business modules (leads, quotes, bookings) arrive in later steps; until then it points those who
// can set the organization up at what to do first.
import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageTitle } from "@/components/page-title";
import { useMe } from "@/session/me-context";
import { visibleNavigationItems, type NavigationItem } from "@/shell/navigation";

type SetUpItem = NavigationItem & { key: Exclude<NavigationItem["key"], "home"> };

export default function HomePage() {
  const t = useTranslations("shell.home");
  const me = useMe();
  const setUp = visibleNavigationItems(me).filter((item): item is SetUpItem => item.key !== "home");
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <PageTitle>{t("title", { name: me.user.name })}</PageTitle>
      {setUp.length > 0 ? (
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
      )}
    </div>
  );
}
