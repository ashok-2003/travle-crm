"use client";

// /quotes/<id> (step 3, P0): one quote. Its status and actions first: the customer's link (copied, or sent on WhatsApp,
// which makes a draft sent), the quotation's PDF, the tax invoice once accepted, Accepted or Declined by hand, Delete;
// then its money beside the form that writes it. A quote out of the member's scope is "not found", as a lead is.
import type { QuoteDetail } from "@travel-crm/contracts/quotes";
import { CopyPlusIcon, FileDownIcon, LinkIcon, MessageCircleIcon, SearchXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyButton } from "@/components/copy-button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { BackLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { refusalOf } from "@/data/api-error";
import { leadRoute, quoteRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { BookingCostsCard } from "@/finance/booking-costs-card";
import { QuoteForm } from "./quote-form";
import { QuoteMoney } from "./quote-money";
import { QuoteStatusBadge } from "./quote-status";
import { SavePackageDialog } from "./save-package-dialog";
import { useOpenDocument, useQuote, useQuoteChanges } from "./use-quotes";

/** The customer's link as WhatsApp shows it, with the words before it. */
const whatsappHref = (phone: string, words: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(words)}`;

function QuoteActions({ quote }: { quote: QuoteDetail }) {
  const t = useTranslations("quotes.quote");
  const router = useRouter();
  const mayEdit = useHolds("quotes:edit");
  const mayCreate = useHolds("quotes:create");
  const changes = useQuoteChanges();
  const open = useOpenDocument(quote.id);
  const [link, setLink] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const share = (then: (url: string) => void) => {
    if (link !== null) {
      then(link);
      return;
    }
    changes.share.mutate(
      { quoteId: quote.id },
      {
        onSuccess: ({ path }) => {
          const url = `${window.location.origin}${path}`;
          setLink(url);
          then(url);
        },
      },
    );
  };
  const words = (url: string) => t("whatsappWords", { name: quote.customerName, title: quote.title, link: url });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {mayEdit && (
          <Button
            disabled={changes.share.isPending}
            onClick={() => {
              share((url) => {
                if (quote.customerPhone === null) {
                  toast.info(t("noPhone"));
                  return;
                }
                window.open(whatsappHref(quote.customerPhone, words(url)), "_blank", "noopener");
              });
            }}
          >
            <MessageCircleIcon aria-hidden="true" />
            {t("sendWhatsapp")}
          </Button>
        )}
        {mayEdit && (
          <Button
            variant="outline"
            disabled={changes.share.isPending}
            onClick={() => {
              share(() => undefined);
            }}
          >
            <LinkIcon aria-hidden="true" />
            {t("makeLink")}
          </Button>
        )}
        <Button
          variant="outline"
          disabled={open.isPending}
          onClick={() => {
            open.mutate({ kind: "quote" });
          }}
        >
          <FileDownIcon aria-hidden="true" />
          {t("pdf")}
        </Button>
        {quote.status === "accepted" && mayEdit && (
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
        {mayCreate && quote.status !== "accepted" && (
          <Button
            variant="outline"
            disabled={changes.duplicate.isPending}
            onClick={() => {
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
            {t("addOption")}
          </Button>
        )}
        {mayEdit && <SavePackageDialog quoteId={quote.id} title={quote.title} />}
        {mayEdit && quote.status !== "accepted" && (
          <Button
            variant="outline"
            disabled={changes.setStatus.isPending}
            onClick={() => {
              changes.setStatus.mutate({ quoteId: quote.id, status: "accepted" });
            }}
          >
            {t("markAccepted")}
          </Button>
        )}
        {mayEdit && quote.status !== "declined" && quote.status !== "accepted" && (
          <Button
            variant="outline"
            disabled={changes.setStatus.isPending}
            onClick={() => {
              changes.setStatus.mutate({ quoteId: quote.id, status: "declined" });
            }}
          >
            {t("markDeclined")}
          </Button>
        )}
        {mayEdit && quote.payments.length === 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setDeleting(true);
            }}
          >
            {t("delete")}
          </Button>
        )}
      </div>
      {link !== null && (
        <div className="flex max-w-xl items-center gap-2">
          <Input readOnly value={link} aria-label={t("linkLabel")} className="numbers" />
          <CopyButton value={link} label={t("copyLink")} />
        </div>
      )}
      {quote.acceptedName !== null && (
        <p className="text-muted-foreground">{t("acceptedBy", { name: quote.acceptedName })}</p>
      )}
      <RefusalAlert error={changes.share.error ?? changes.setStatus.error ?? changes.duplicate.error ?? open.error} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        action={t("delete")}
        destructive
        request={changes.remove}
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

export function QuoteScreen({ quoteId }: { quoteId: string }) {
  const t = useTranslations("quotes.quote");
  const quote = useQuote(quoteId);
  const { update } = useQuoteChanges();
  const body = (): ReactNode => {
    if (quote.data) {
      const data = quote.data;
      return (
        <>
          <BackLink href={leadRoute(data.leadId)} label={t("backToLead", { name: data.customerName })} />
          <PageHeader title={data.title} intro={<QuoteStatusBadge status={data.status} />} />
          <QuoteActions quote={data} />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            <QuoteForm
              key={data.updatedAt}
              quote={data}
              sending={update}
              onSave={(input) => {
                update.mutate(input, { onSuccess: () => toast.success(t("saved")) });
              }}
            />
            <div className="flex flex-col gap-6 xl:sticky xl:top-6">
              <QuoteMoney quote={data} />
              <BookingCostsCard quoteId={data.id} />
            </div>
          </div>
        </>
      );
    }
    if (refusalOf(quote.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("notFound")} />;
    }
    if (quote.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={quote.error}
          retryLabel={t("retry")}
          onRetry={() => void quote.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("loading")} />;
  };
  return (
    <div className="flex max-w-[1200px] flex-col gap-6">
      {quote.data === undefined && <BackLink href={routes.quotes} label={t("backToQuotes")} />}
      {body()}
    </div>
  );
}
