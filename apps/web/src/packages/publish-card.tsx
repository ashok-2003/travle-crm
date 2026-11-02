"use client";

// Publishing a package's page (release 7b): outward-facing, so it needs a name, an address, a summary and a photo, and the
// agency's pages must be on in Settings. Whoever manages settings publishes or takes the page down; others read where it stands.
import type { PackageDetail } from "@travel-crm/contracts/quotes";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { CopyButton } from "@/components/copy-button";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { usePackageChanges } from "./use-packages";

export function PublishCard({ detail }: { detail: PackageDetail }) {
  const t = useTranslations("packages.publish");
  const mayPublish = useHolds("settings:manage");
  const access = useWriteAccess("change");
  const { setPublished } = usePackageChanges();
  const address =
    detail.slug === null || typeof window === "undefined"
      ? null
      : `${window.location.origin}/a/${detail.agencyCode}/${detail.slug}`;
  const ready = detail.gaps.length === 0;
  return (
    <SectionCard title={t("title")}>
      <p>
        {detail.published ? (
          <StatusBadge tone="good">{t("published")}</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">{t("notPublished")}</StatusBadge>
        )}
      </p>
      {!detail.pagesEnabled && (
        <p className="text-muted-foreground">
          {t("pagesOff")}{" "}
          {mayPublish && (
            <TextLink inline href={routes.publicPageSettings}>
              {t("turnOn")}
            </TextLink>
          )}
        </p>
      )}
      {!ready && (
        <div>
          <p className="font-semibold">{t("needs")}</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {detail.gaps.map((gap) => (
              <li key={gap}>{t(`gaps.${gap}`)}</li>
            ))}
          </ul>
        </div>
      )}
      {detail.published && address !== null && (
        <div className="flex max-w-xl items-center gap-2">
          <Input readOnly value={address} aria-label={t("addressLabel")} className="numbers" />
          <CopyButton value={address} label={t("copy")} />
        </div>
      )}
      {detail.published && address !== null && (
        <div>
          <TextLink href={`/a/${detail.agencyCode}/${detail.slug ?? ""}`} newTab>
            {t("open")}
          </TextLink>
        </div>
      )}
      <RefusalAlert error={setPublished.error} />
      {mayPublish ? (
        <div>
          <Button
            variant={detail.published ? "outline" : "default"}
            disabled={setPublished.isPending || !access.allowed || (!detail.published && !ready)}
            onClick={() => {
              setPublished.mutate(
                { packageId: detail.id, published: !detail.published },
                { onSuccess: () => toast.success(t(detail.published ? "takenDown" : "nowPublished")) },
              );
            }}
          >
            {detail.published ? t("takeDown") : t("publish")}
          </Button>
        </div>
      ) : (
        <p className="text-caption text-muted-foreground">{t("managerOnly")}</p>
      )}
    </SectionCard>
  );
}
