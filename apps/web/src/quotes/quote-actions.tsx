"use client";

// A quote's actions in one row (quotes revamp): send it on WhatsApp, its live link with Copy, its PDF, Edit, Mark accepted
// (green), Mark declined and Delete (red), and a "⋯" menu for the rest. Sharing makes a draft sent, as it always did.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { CopyPlusIcon, EllipsisIcon, FileDownIcon, LinkIcon, SquarePenIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { WhatsAppLogo } from "@/components/contact-icons";
import { GlyphButton, IconButton } from "@/components/icon-button";
import { RefusalAlert } from "@/components/refusal-alert";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rupees } from "@/components/forms/money-field";
import { leadRoute, quoteRoute } from "@/lib/routes";
import { percentText } from "@/lib/percent";
import { useHolds } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { SavePackageDialog } from "./save-package-dialog";
import { useOpenDocument, useQuoteChanges, useQuoteSettings } from "./use-quotes";

/** The customer's link as WhatsApp shows it, with the words before it. */
const whatsappHref = (phone: string, words: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(words)}`;

export function QuoteActions({
  quote,
  onEdit,
}: {
  quote: QuoteDetail;
  /** A draft shown read (an AI booking's): Edit opens its form first. */
  onEdit?: (() => void) | undefined;
}) {
  const t = useTranslations("quotes.quote");
  const tMargin = useTranslations("quotes.margin");
  const tPackage = useTranslations("quotes.package");
  const router = useRouter();
  const seesMargin = useHolds("money:view_margin");
  const settings = useQuoteSettings();
  const mayEdit = useHolds("quotes:edit");
  const mayCreate = useHolds("quotes:create");
  const mayRecord = useHolds("quotes:record_payments");
  const access = useWriteAccess("change");
  const hintId = useId();
  const gate = { disabled: !access.allowed, "aria-describedby": access.hint === null ? undefined : hintId };
  const live = quote.status !== "replaced" && quote.status !== "declined";
  const changes = useQuoteChanges();
  const open = useOpenDocument(quote.id);
  const [link, setLink] = useState<{ path: string; url: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const sendButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  // A draft below the agency's minimum margin asks first; "Send anyway" goes on (release 7b: it warns, never blocks).
  const [askBelowMinimum, setAskBelowMinimum] = useState<(() => void) | null>(null);
  const unpriced = quote.needsRateLines > 0;
  const share = (then: (shared: { path: string; url: string }) => void) => {
    if (link !== null) {
      then(link);
      return;
    }
    const send = () => {
      changes.share.mutate(
        { quoteId: quote.id },
        {
          onSuccess: ({ path }) => {
            const shared = { path, url: `${window.location.origin}${path}` };
            setLink(shared);
            then(shared);
          },
        },
      );
    };
    if (quote.status === "draft" && quote.margin.belowMinimum) setAskBelowMinimum(() => send);
    else send();
  };
  const sharing = changes.share.isPending || unpriced;
  const editsInPlace = quote.status === "draft";
  const makesVersion = mayCreate && (quote.status === "sent" || quote.status === "declined");
  const mayDuplicate = mayCreate && (quote.status === "draft" || quote.status === "sent");
  const mayDelete = quote.status !== "accepted" && quote.payments.length === 0 && quote.invoiceDocumentId === null;
  const showsMenu = mayDuplicate || mayEdit;
  const editLabel = (
    <>
      <SquarePenIcon aria-hidden="true" />
      {t("edit")}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label={t("actionsLabel")} className="flex flex-wrap items-center gap-3">
        {mayEdit && live && (
          <GlyphButton
            ref={sendButton}
            variant="send"
            aria-label={t("sendWhatsapp")}
            {...gate}
            disabled={gate.disabled || sharing}
            onClick={() => {
              share(({ url }) => {
                if (quote.customerPhone === null) {
                  toast.info(t("noPhone"));
                  return;
                }
                const words = t("whatsappWords", { name: quote.customerName, title: quote.title, link: url });
                window.open(whatsappHref(quote.customerPhone, words), "_blank", "noopener");
              });
            }}
          >
            <WhatsAppLogo className="size-4" />
          </GlyphButton>
        )}
        {mayEdit && live && (
          <>
            {link === null ? (
              <Button
                variant="link"
                {...gate}
                disabled={gate.disabled || sharing}
                onClick={() => {
                  share(() => undefined);
                }}
              >
                <LinkIcon aria-hidden="true" />
                {t("createLiveLink")}
              </Button>
            ) : (
              <>
                <TextLink href={link.path} newTab>
                  <LinkIcon aria-hidden="true" />
                  {t("liveLink")}
                </TextLink>
                <CopyButton value={link.url} label={t("copyLink")} iconOnly />
              </>
            )}
          </>
        )}
        <IconButton
          variant="outline"
          aria-label={t("pdf")}
          disabled={open.isPending}
          onClick={() => {
            open.mutate({ kind: "quote" });
          }}
        >
          <FileDownIcon aria-hidden="true" />
        </IconButton>
        {quote.status === "accepted" && mayRecord && (
          <Button
            variant="outline"
            disabled={open.isPending}
            onClick={() => {
              open.mutate({ kind: "invoice" });
            }}
          >
            <FileDownIcon aria-hidden="true" />
            {quote.invoiceDocumentId === null ? t("issueInvoice") : t("invoice")}
          </Button>
        )}
        {mayEdit && editsInPlace && (
          <Button variant="outline" asChild>
            <Link href="#quote-form" onClick={onEdit}>
              {editLabel}
            </Link>
          </Button>
        )}
        {mayEdit && makesVersion && (
          <Button
            variant="outline"
            {...gate}
            disabled={gate.disabled || changes.newVersion.isPending}
            onClick={() => {
              changes.newVersion.mutate(
                { quoteId: quote.id },
                {
                  onSuccess: (draft) => {
                    toast.success(t("versionMade"));
                    router.push(quoteRoute(draft.id));
                  },
                },
              );
            }}
          >
            {editLabel}
          </Button>
        )}
        {mayEdit && quote.status === "sent" && (
          <>
            <Button
              variant="success"
              {...gate}
              disabled={gate.disabled || changes.setStatus.isPending}
              onClick={() => {
                changes.setStatus.mutate({ quoteId: quote.id, status: "accepted" });
              }}
            >
              {t("markAccepted")}
            </Button>
            <Button
              variant="destructive"
              {...gate}
              disabled={gate.disabled || changes.setStatus.isPending}
              onClick={() => {
                changes.setStatus.mutate({ quoteId: quote.id, status: "declined" });
              }}
            >
              {t("markDeclined")}
            </Button>
          </>
        )}
        {/* The same rule as the api's: an accepted, paid or invoiced quote is a booking and stays. */}
        {mayEdit && mayDelete && (
          <IconButton
            ref={deleteButton}
            variant="destructive"
            aria-label={t("delete")}
            {...gate}
            onClick={() => {
              setDeleting(true);
            }}
          >
            <Trash2Icon aria-hidden="true" />
          </IconButton>
        )}
        {showsMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button ref={menuButton} variant="ghost" size="icon" aria-label={t("more")}>
                <EllipsisIcon aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {mayDuplicate && (
                <DropdownMenuItem
                  disabled={gate.disabled || changes.duplicate.isPending}
                  onSelect={() => {
                    changes.duplicate.mutate(
                      { quoteId: quote.id },
                      {
                        onSuccess: (copy) => {
                          toast.success(t("optionMade"));
                          router.push(quoteRoute(copy.id));
                        },
                      },
                    );
                  }}
                >
                  <CopyPlusIcon aria-hidden="true" />
                  {t("duplicateOption")}
                </DropdownMenuItem>
              )}
              {mayEdit && (
                <DropdownMenuItem
                  disabled={gate.disabled}
                  onSelect={() => {
                    setSavingPackage(true);
                  }}
                >
                  {tPackage("save")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <WriteHint id={hintId} hint={access.hint} />
      <RefusalAlert
        error={
          changes.share.error ??
          changes.setStatus.error ??
          changes.duplicate.error ??
          changes.newVersion.error ??
          open.error
        }
      />
      {mayEdit && (
        <SavePackageDialog
          quoteId={quote.id}
          title={quote.title}
          held={{ open: savingPackage, setOpen: setSavingPackage }}
          returnFocusTo={menuButton}
        />
      )}
      <ConfirmDialog
        open={askBelowMinimum !== null}
        onOpenChange={(next) => {
          if (!next) setAskBelowMinimum(null);
        }}
        title={tMargin("sendTitle")}
        returnFocusTo={sendButton}
        description={
          seesMargin && quote.margin.marginBasisPoints !== null
            ? tMargin("belowFigures", {
                share: percentText(quote.margin.marginBasisPoints),
                amount: rupees(quote.margin.marginPaise ?? 0),
                minimum: percentText(settings.data?.minMarginBasisPoints ?? 0),
                hasMinimum: String(settings.data?.minMarginBasisPoints != null),
              })
            : tMargin("belowSentence")
        }
        action={tMargin("sendAnyway")}
        request={changes.share}
        onConfirm={() => {
          const go = askBelowMinimum;
          setAskBelowMinimum(null);
          go?.();
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        action={t("delete")}
        destructive
        request={changes.remove}
        returnFocusTo={deleteButton}
        onConfirm={() => {
          changes.remove.mutate(
            { quoteId: quote.id },
            {
              onSuccess: () => {
                setDeleting(false);
                router.push(leadRoute(quote.leadId));
              },
            },
          );
        }}
      />
    </div>
  );
}
