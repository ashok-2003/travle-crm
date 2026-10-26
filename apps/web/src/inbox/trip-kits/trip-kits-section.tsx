"use client";

// Trip details on /settings/whatsapp (sales inbox, trip details), for the Owner and Admins: each trip as a card, with the
// words sent first, its keywords, whether they send it by themselves, and its files (photos, videos, PDFs, voice notes),
// added and removed here. A chat's Send details sends any of them.
import {
  MAX_TRIP_KIT_FILES,
  MAX_WHATSAPP_SEND_BYTES,
  whatsappSendContentTypes,
  type TripKit,
} from "@travel-crm/contracts/inbox";
import { FileIcon, FileTextIcon, ImageIcon, MicIcon, PackageIcon, PlusIcon, VideoIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { formatFileSize } from "@/files/file-size";
import { useWriteAccess } from "@/subscription/write-access";
import { TripKitDialog } from "./trip-kit-dialog";
import { useSaveTripKit, useTripKitFiles, useTripKits } from "./use-trip-kits";

const acceptedTypes = whatsappSendContentTypes.join(",");
const sendable: readonly string[] = whatsappSendContentTypes;

export const fileIconOf = (contentType: string) =>
  contentType.startsWith("image/")
    ? ImageIcon
    : contentType.startsWith("video/")
      ? VideoIcon
      : contentType.startsWith("audio/")
        ? MicIcon
        : contentType === "application/pdf"
          ? FileTextIcon
          : FileIcon;

function TripFiles({ kit }: { kit: TripKit }) {
  const t = useTranslations("inbox.tripKits");
  const access = useWriteAccess("change");
  const { add, remove } = useTripKitFiles(kit.id);
  const picker = useRef<HTMLInputElement>(null);
  const room = MAX_TRIP_KIT_FILES - kit.files.length;
  const choose = (chosen: FileList | null) => {
    const files = [...(chosen ?? [])];
    const refused = files.filter((file) => !sendable.includes(file.type) || file.size > MAX_WHATSAPP_SEND_BYTES);
    if (refused.length > 0) toast.error(t("filesRefused", { count: refused.length }));
    const taken = files.filter((file) => !refused.includes(file)).slice(0, room);
    if (taken.length > 0) add.mutate(taken);
  };
  return (
    <div className="flex flex-col gap-2">
      {kit.files.length > 0 && (
        <ItemGroup>
          {kit.files.map((file) => {
            const Icon = fileIconOf(file.contentType);
            return (
              <Item key={file.id} size="sm" variant="muted">
                <ItemMedia variant="icon">
                  <Icon aria-hidden="true" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="w-full truncate">{file.fileName}</ItemTitle>
                  <ItemDescription className="numbers">{formatFileSize(file.sizeBytes)}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("removeFile", { name: file.fileName })}
                    disabled={!access.allowed || remove.isPending}
                    onClick={() => {
                      remove.mutate({ tripKitId: kit.id, attachmentId: file.id });
                    }}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      <RefusalAlert error={add.error ?? remove.error} />
      <input
        ref={picker}
        type="file"
        multiple
        accept={acceptedTypes}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = "";
        }}
      />
      <Button
        variant="outline"
        className="self-start"
        disabled={!access.allowed || add.isPending || room <= 0}
        onClick={() => picker.current?.click()}
      >
        {add.isPending ? <Spinner aria-hidden="true" /> : <PlusIcon aria-hidden="true" />}
        {add.isPending ? t("uploading") : t("addFiles")}
      </Button>
      <p className="text-caption text-muted-foreground">{t("filesHint", { count: MAX_TRIP_KIT_FILES })}</p>
    </div>
  );
}

function TripCard({ kit }: { kit: TripKit }) {
  const t = useTranslations("inbox.tripKits");
  const access = useWriteAccess("change");
  const { remove } = useSaveTripKit();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{kit.name}</CardTitle>
        <CardDescription>
          {kit.autoSend && kit.keywords.length > 0 ? (
            <StatusBadge tone="good">{t("sendsItself")}</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">{t("sentByHand")}</StatusBadge>
          )}
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <Button
            ref={editButton}
            variant="outline"
            disabled={!access.allowed}
            aria-label={t("editNamed", { name: kit.name })}
            onClick={() => {
              setEditing(true);
            }}
          >
            {t("edit")}
          </Button>
          {editing && (
            <TripKitDialog existing={kit} held={{ open: editing, setOpen: setEditing }} returnFocusTo={editButton} />
          )}
          <Button
            ref={deleteButton}
            variant="outline"
            disabled={!access.allowed}
            aria-label={t("deleteNamed", { name: kit.name })}
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t("delete")}
          </Button>
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={t("deleteTitle", { name: kit.name })}
            description={t("deleteDescription")}
            action={t("delete")}
            request={remove}
            onConfirm={() => {
              remove.mutate(
                { tripKitId: kit.id },
                {
                  onSuccess: () => {
                    setDeleting(false);
                  },
                },
              );
            }}
            returnFocusTo={deleteButton}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {kit.message !== "" && (
          <p className="line-clamp-4 whitespace-pre-line text-muted-foreground wrap-anywhere" dir="auto">
            {kit.message}
          </p>
        )}
        {kit.keywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-caption text-muted-foreground">{t("keywordsLabel")}</span>
            {kit.keywords.map((keyword) => (
              <Badge key={keyword} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </div>
        )}
        <TripFiles kit={kit} />
      </CardContent>
    </Card>
  );
}

export function TripKitsSection() {
  const t = useTranslations("inbox.tripKits");
  const list = useTripKits();
  const body = () => {
    if (list.data === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={t("retry")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (list.data.length === 0) return <EmptyState icon={PackageIcon} message={t("empty")} />;
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {list.data.map((kit) => (
          <TripCard key={kit.id} kit={kit} />
        ))}
      </div>
    );
  };
  return (
    <section aria-labelledby="trip-kits-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="trip-kits-heading" className="text-section font-semibold">
          {t("title")}
        </h2>
        <TripKitDialog />
      </div>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      {body()}
    </section>
  );
}
