// The frame of the screens outside the app shell (signing in, passwords, two-factor, an invite's link): on wide screens
// the product's own panel in the deep green on the left (its mark, what it does for an agency, three things it does)
// beside the form; on phones the mark above the form, edge to edge with a 16px gutter.
import { BotIcon, FlameIcon, RepeatIcon } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand-mark";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("account.brandPanel");
  const points = [
    { key: "answers", icon: BotIcon },
    { key: "hot", icon: FlameIcon },
    { key: "followUps", icon: RepeatIcon },
  ] as const;
  return (
    <NextIntlClientProvider>
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between xl:p-16">
          {/* Two soft rings of light behind the words, in the panel's own colours. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-sidebar-accent/60 blur-3xl"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -left-24 size-[24rem] rounded-full bg-primary-foreground/10 blur-3xl"
          />
          <div className="relative">
            <BrandMark onDark size="lg" />
          </div>
          <div className="relative flex max-w-lg flex-col gap-8">
            <div className="flex flex-col gap-4">
              <p className="text-label font-semibold tracking-wide text-sidebar-foreground/90 uppercase">
                {t("eyebrow")}
              </p>
              <h2 className="text-title leading-tight font-semibold text-balance">{t("headline")}</h2>
              <p className="text-body text-sidebar-foreground/90">{t("subline")}</p>
            </div>
            <ul className="flex flex-col gap-4">
              {points.map((point) => (
                <li key={point.key} className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/10">
                    <point.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">{t(`points.${point.key}.title`)}</span>
                    <span className="text-label text-sidebar-foreground/90">{t(`points.${point.key}.text`)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="relative text-caption text-sidebar-foreground/90">{t("footer")}</p>
        </aside>
        <div className="flex flex-col items-center px-4 py-10 sm:justify-center sm:py-16">
          <main className="flex w-full max-w-sm flex-col gap-8">
            <div className="lg:hidden">
              <BrandMark />
            </div>
            {children}
          </main>
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
