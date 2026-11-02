"use client";

// A package's photos (release 7b): up to six pictures that go straight to storage and are shown on its public page. The first
// is the page's picture in a link preview. Needs one before the page can be published.
import { MAX_PACKAGE_PHOTOS } from "@travel-crm/contracts/quotes";
import { ImagePlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { SectionCard } from "@/bookings/section-card";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useWriteAccess } from "@/subscription/write-access";
import { usePackagePhotoChanges, usePackagePhotos } from "./use-packages";

const ACCEPTED = "image/jpeg,image/png,image/webp";

export function PackagePhotos({ packageId }: { packageId: string }) {
  const t = useTranslations("packages.photos");
  const photos = usePackagePhotos(packageId);
  const { add, remove } = usePackagePhotoChanges(packageId);
  const access = useWriteAccess("change");
  const picker = useRef<HTMLInputElement>(null);
  const held = photos.data?.length ?? 0;
  return (
    <SectionCard title={t("title")}>
      <p className="text-muted-foreground">{t("intro", { max: MAX_PACKAGE_PHOTOS })}</p>
      {photos.data === undefined ? (
        photos.isError ? (
          <LoadFailedAlert message={t("loadFailed")} error={photos.error} onRetry={() => void photos.refetch()} />
        ) : (
          <LoadingRows shape="twoLines" label={t("loading")} />
        )
      ) : photos.data.length === 0 ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.data.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-2">
              {photo.url !== null && (
                // A presigned link to storage, which Next's image optimiser can't fetch.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.url}
                  alt={t("alt", { number: index + 1 })}
                  className="aspect-4/3 w-full rounded-card object-cover"
                />
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-muted-foreground">{index === 0 ? t("first") : photo.fileName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeNamed", { name: photo.fileName })}
                  disabled={remove.isPending || !access.allowed}
                  onClick={() => {
                    remove.mutate({ packageId, attachmentId: photo.id });
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <RefusalAlert error={add.error ?? remove.error} />
      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPTED}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="package-photo-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])].slice(0, MAX_PACKAGE_PHOTOS - held);
          event.target.value = "";
          if (files.length > 0) add.mutate(files);
        }}
      />
      <div>
        <Button
          variant="outline"
          disabled={add.isPending || held >= MAX_PACKAGE_PHOTOS || !access.allowed}
          onClick={() => picker.current?.click()}
        >
          {add.isPending ? <Spinner aria-hidden="true" /> : <ImagePlusIcon aria-hidden="true" />}
          {add.isPending ? t("adding") : t("add")}
        </Button>
      </div>
    </SectionCard>
  );
}
