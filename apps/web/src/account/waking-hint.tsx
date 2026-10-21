"use client";

// Under a sign-in's button once it has taken a few seconds: the api is most likely waking from sleep (the auth client
// waits for it and sends the sign-in again), so the person knows to wait rather than press again.
import { useTranslations } from "next-intl";
import { Delayed } from "@/components/delayed";

/** Long enough that a normal sign-in never shows it. */
export const WAKING_HINT_AFTER = 4_000;

export function WakingHint({ busy }: { busy: boolean }) {
  const t = useTranslations("common");
  if (!busy) return null;
  return (
    <Delayed after={WAKING_HINT_AFTER}>
      <p role="status" className="text-label text-muted-foreground">
        {t("serverWaking")}
      </p>
    </Delayed>
  );
}
