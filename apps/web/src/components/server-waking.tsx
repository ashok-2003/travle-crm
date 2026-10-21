"use client";

// What a screen shows while a sleeping server wakes (data/server-waking.ts): a spinner and a plain sentence, so a
// cold start never reads as a failure. `standalone` centres it in the window, for a gate before the shell.
import { useTranslations } from "next-intl";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

export function ServerWaking({ standalone = false }: { standalone?: boolean }) {
  const t = useTranslations("common");
  const waking = (
    <Empty role="status">
      <EmptyHeader>
        <EmptyMedia>
          <Spinner className="size-8 text-muted-foreground" />
        </EmptyMedia>
        <EmptyDescription>{t("serverWaking")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
  return standalone ? <main className="flex min-h-dvh items-center justify-center px-4">{waking}</main> : waking;
}
