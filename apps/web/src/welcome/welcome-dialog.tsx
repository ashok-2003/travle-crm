"use client";

// The welcome (the owner, 2026-10-28): each member of a new organization sees it once, over the app, with the product's
// video (public/welcome/welcome.mp4, which plays at once, muted until they choose sound, and may be skipped); a company
// that came through the invite program reads that it is one of the few invited, and its free days. Closing it, either
// way, counts it as seen. Without the video the words alone show.
import { brand } from "@travel-crm/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTRPC } from "@/data/trpc";
import { useMe } from "@/session/me-context";

/** Where the welcome's video is kept: drop the file in apps/web/public/welcome/. */
const WELCOME_VIDEO = "/welcome/welcome.mp4";

export function WelcomeDialog() {
  const t = useTranslations("welcome");
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const welcome = useQuery({ ...trpc.usage.welcome.queryOptions(), staleTime: Infinity });
  const seen = useMutation(
    trpc.usage.welcomeSeen.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: trpc.usage.welcome.queryKey() }),
    }),
  );
  const [closed, setClosed] = useState(false);
  const [noVideo, setNoVideo] = useState(false);
  const data = welcome.data;
  if (data?.show !== true || closed) return null;

  const firstName = me.user.name.trim().split(/\s+/)[0] ?? me.user.name;
  const close = () => {
    setClosed(true);
    seen.mutate();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="gap-3">
          <BrandMark />
          {data.vip && <p className="text-label font-semibold tracking-wide text-primary uppercase">{t("vipBadge")}</p>}
          <DialogTitle className="text-title-mobile sm:text-title">
            {data.vip
              ? t("vipTitle", { name: firstName, company: me.organization.name })
              : t("title", { name: firstName, product: brand.productName })}
          </DialogTitle>
          <DialogDescription className="text-body">
            {data.vip
              ? t("vipDescription", { company: me.organization.name, product: brand.productName })
              : t("description", { product: brand.productName })}
          </DialogDescription>
        </DialogHeader>
        {!noVideo && (
          // The product's own video: no captions file to give, so the words above say what it shows.
          <video
            src={WELCOME_VIDEO}
            className="aspect-video w-full rounded-xl bg-muted"
            autoPlay
            preload="metadata"
            muted
            playsInline
            controls
            onError={() => {
              setNoVideo(true);
            }}
          />
        )}
        {data.vip && (
          <p className="rounded-xl bg-muted p-4 text-body">
            {t("vipGift", { days: data.trialDays ?? 30, product: brand.productName })}
          </p>
        )}
        <DialogFooter>
          <Button size="lg" onClick={close}>
            {t("start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
