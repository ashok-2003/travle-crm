"use client";

// The logo on the branding screen: the current one, shown through its short-lived link, and uploading a PNG or JPEG
// straight to storage with its progress (with Stop, and Try again after a failure), or removing it. Type and size are
// checked here before anything is sent.
import { useQuery } from "@tanstack/react-query";
import { MAX_LOGO_BYTES, type OrganizationLogo } from "@travel-crm/contracts/profile";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Delayed } from "@/components/delayed";
import { ErrorState } from "@/components/error-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/data/trpc";
import { formatFileSize } from "@/files/file-size";
import { UploadError } from "@/files/upload";
import { wasStopped } from "@/files/use-signed-upload";
import { useErrorMessage } from "@/lib/error-message";
import { useWriteAccess } from "@/subscription/write-access";
import { logoUploadOf } from "./logo-file";
import { useLogoUpload, useRemoveLogo } from "./use-logo";

/** The logo as it was uploaded, contained in the space a document's header gives it. */
function LogoImage({ logo }: { logo: OrganizationLogo }) {
  const t = useTranslations("documents.branding.logo");
  const [broken, setBroken] = useState(false);
  if (broken) return <p className="text-label text-status-bad-ink">{t("broken")}</p>;
  return (
    <div className="relative h-20 w-48">
      {/* Unoptimized: the link is storage's own, signed and short-lived, never fetched by the web server. */}
      <Image
        src={logo.url}
        alt={t("alt")}
        fill
        unoptimized
        sizes="192px"
        className="object-contain object-left"
        onError={() => {
          setBroken(true);
        }}
      />
    </div>
  );
}

export function LogoPanel() {
  const t = useTranslations("documents.branding.logo");
  const tCommon = useTranslations("common");
  const trpc = useTRPC();
  // The link lasts five minutes: never kept in the saved copy, and asked for again once it is a minute old.
  const logo = useQuery(
    trpc.organization.logo.get.queryOptions(undefined, { staleTime: 60_000, meta: { persist: false } }),
  );
  const { upload, progress, stop } = useLogoUpload();
  const { apiError } = useErrorMessage();
  const [problem, setProblem] = useState<string | null>(null);
  const write = useWriteAccess();
  const fileInput = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState(false);
  const remove = useRemoveLogo(() => {
    setRemoving(false);
  });
  const uploading = upload.isPending;
  const size = formatFileSize(MAX_LOGO_BYTES);

  const choose = (file: File) => {
    const checked = logoUploadOf(file);
    upload.reset();
    setProblem(checked.ok ? null : t(checked.problem, { size }));
    if (checked.ok) upload.mutate({ file, input: checked.input });
  };
  const failed = upload.isError && !wasStopped(upload.error);

  const preview = () => {
    if (logo.data) return <LogoImage key={logo.data.url} logo={logo.data} />;
    if (logo.data === null) return <p className="text-muted-foreground">{t("none")}</p>;
    if (logo.isError) {
      return (
        <ErrorState message={t("loadFailed")} retryLabel={tCommon("tryAgain")} onRetry={() => void logo.refetch()} />
      );
    }
    return (
      <Delayed>
        <Skeleton role="status" aria-label={tCommon("loading")} className="h-20 w-48" />
      </Delayed>
    );
  };

  return (
    <section aria-labelledby="logo-heading" className="flex flex-col gap-3">
      <h2 id="logo-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {preview()}
          <p className="text-label text-muted-foreground">{t("hint", { size })}</p>
          {uploading && (
            <div className="flex flex-col gap-2">
              <Progress value={progress * 100} aria-label={t("uploading")} />
              <Button type="button" variant="ghost" className="self-start" onClick={stop}>
                {t("stop")}
              </Button>
            </div>
          )}
          {problem !== null && (
            <Alert variant="destructive">
              <AlertDescription>{problem}</AlertDescription>
            </Alert>
          )}
          {failed && (
            <div className="flex flex-col items-start gap-2">
              <Alert variant="destructive">
                <AlertDescription>
                  {upload.error instanceof UploadError ? t("uploadFailed") : apiError(upload.error)}
                </AlertDescription>
              </Alert>
              <Button
                type="button"
                variant="outline"
                aria-label={t("tryAgain")}
                disabled={!write.allowed}
                onClick={() => {
                  upload.mutate(upload.variables);
                }}
              >
                {tCommon("tryAgain")}
              </Button>
            </div>
          )}
          {/* Hidden from everyone, screen readers too: the button opens it. Labelled for tests and journeys. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg"
            aria-label={t("fileLabel")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared, so choosing the same file again (after a failed upload) is a change too.
              event.target.value = "";
              if (file) choose(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!write.allowed || uploading || logo.isPending}
              onClick={() => fileInput.current?.click()}
            >
              {logo.data ? t("replace") : t("upload")}
            </Button>
            {logo.data && (
              <Button
                variant="outline"
                disabled={!write.allowed || uploading}
                onClick={() => {
                  setRemoving(true);
                }}
              >
                {t("remove")}
              </Button>
            )}
          </div>
          {write.hint !== null && <p className="text-label text-muted-foreground">{write.hint}</p>}
        </CardContent>
      </Card>
      {/* Documents issued from now on have no logo; those already issued keep theirs. */}
      {logo.data && (
        <ConfirmDialog
          open={removing}
          onOpenChange={setRemoving}
          title={t("removeTitle")}
          description={t("removeDescription")}
          action={t("removeConfirm")}
          request={remove}
          onConfirm={() => {
            if (logo.data) remove.mutate({ attachmentId: logo.data.attachmentId });
          }}
        />
      )}
    </section>
  );
}
