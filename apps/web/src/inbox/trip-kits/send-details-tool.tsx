"use client";

// Send details in the reply box's tools (sales inbox, trip details): the agency's trips, each with what it holds; Send puts
// its words and every file in the chat at once, each a message of its own. Trips are set up in Settings, WhatsApp.
import { PackageIcon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { RefusalAlert } from "@/components/refusal-alert";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useHolds } from "@/session/me-context";
import { useSendTripKit, useTripKits } from "./use-trip-kits";

export function SendDetailsTool({
  conversationId,
  disabled,
  listed = false,
}: {
  conversationId: string;
  disabled: boolean;
  /** Drawn as a line of a list (the phone's tools sheet), not as a button in a row. */
  listed?: boolean;
}) {
  const t = useTranslations("inbox.tripKits.send");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const kits = useTripKits();
  const mayManage = useHolds("inbox:templates");
  const { send, sendKit } = useSendTripKit(conversationId);
  const [sending, setSending] = useState<string | null>(null);

  const list = () => {
    if (kits.data === undefined) {
      return kits.isError ? (
        <LoadFailedAlert message={t("loadFailed")} error={kits.error} onRetry={() => void kits.refetch()} />
      ) : (
        <LoadingRows shape="twoLines" label={t("loading")} />
      );
    }
    if (kits.data.length === 0) {
      return (
        <EmptyState
          icon={PackageIcon}
          message={t("empty")}
          {...(mayManage && {
            action: (
              <Button asChild variant="outline">
                <Link href={routes.whatsapp}>{t("setUp")}</Link>
              </Button>
            ),
          })}
        />
      );
    }
    return (
      <ItemGroup className="gap-2">
        {kits.data.map((kit) => (
          <Item key={kit.id} variant="outline">
            <ItemContent className="min-w-0">
              <ItemTitle>{kit.name}</ItemTitle>
              <ItemDescription>
                {t(kit.message === "" ? "holds" : "holdsWithDetails", { files: kit.files.length })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                variant="send"
                disabled={send.isPending || (kit.message === "" && kit.files.length === 0)}
                aria-label={t("sendNamed", { name: kit.name })}
                onClick={() => {
                  setSending(kit.id);
                  sendKit(kit.id, {
                    onSuccess: (queued) => {
                      toast.success(t("sent", { count: queued }));
                      setOpen(false);
                    },
                  });
                }}
              >
                {send.isPending && sending === kit.id ? (
                  <Spinner aria-hidden="true" />
                ) : (
                  <SendIcon aria-hidden="true" />
                )}
                {t("send")}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    );
  };

  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="ghost"
        className={cn("shrink-0 gap-1.5 px-2.5 text-muted-foreground", listed && "w-full justify-start gap-2")}
        disabled={disabled}
        onClick={() => {
          send.reset();
          setOpen(true);
        }}
      >
        <PackageIcon aria-hidden="true" />
        {t("button")}
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        busy={send.isPending}
        title={t("title")}
        description={t("description")}
        returnFocusTo={button}
      >
        <div className="flex flex-col gap-3">
          <RefusalAlert error={send.error} />
          {list()}
        </div>
      </ResponsiveDialog>
    </>
  );
}
