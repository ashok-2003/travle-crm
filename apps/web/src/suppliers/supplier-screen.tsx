"use client";

// /suppliers/<id> (release 7a): one supplier. Its details (the bank and UPI text only for whoever may change suppliers), its
// contacts, and, for whoever sees the accounts, the costs linked to it with what is owed and "Link N costs named like this
// one". Deleting is refused while the agency still owes it money.
import { PhoneIcon, SearchXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/bookings/section-card";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { rupees } from "@/components/forms/money-field";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { RefusalAlert } from "@/components/refusal-alert";
import { StatusBadge } from "@/components/status-badge";
import { BackLink, TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { refusalOf } from "@/data/api-error";
import { formatCalendarDay } from "@/lib/format";
import { departureRoute, quoteRoute, routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { ContactDialog } from "./contact-dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { useSupplier, useSupplierChanges } from "./use-suppliers";

export function SupplierScreen({ supplierId }: { supplierId: string }) {
  const t = useTranslations("suppliers");
  const tCommon = useTranslations("common");
  const tCategory = useTranslations("finance.costForm.categories");
  const router = useRouter();
  const supplier = useSupplier(supplierId);
  const mayEdit = useHolds("suppliers:edit");
  const mayLink = useHolds("accounts:edit");
  const changes = useSupplierChanges();
  const [deleting, setDeleting] = useState(false);
  const [removingContact, setRemovingContact] = useState<string | null>(null);
  const body = (): ReactNode => {
    if (supplier.data) {
      const data = supplier.data;
      const given = (text: string) => (text === "" ? t("page.none") : text);
      return (
        <>
          <BackLink href={routes.suppliers} label={t("page.back")} />
          <PageHeader
            title={data.name}
            intro={
              <>
                {t(`kinds.${data.kind}`)}
                {data.city === "" ? "" : ` · ${data.city}`}
              </>
            }
            action={
              mayEdit && (
                <div className="flex flex-wrap gap-2">
                  <SupplierFormDialog supplier={data} trigger={{ label: t("page.edit") }} />
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDeleting(true);
                    }}
                  >
                    {t("page.delete")}
                  </Button>
                </div>
              )
            }
          />
          <SectionCard title={t("page.details")}>
            <dl className="grid gap-3 md:grid-cols-2">
              {(
                [
                  ["gstin", data.gstin],
                  ["paymentTerms", data.paymentTerms],
                  ...(mayEdit ? ([["paymentDetails", data.paymentDetails]] as const) : []),
                  ["notes", data.notes],
                ] as const
              ).map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <dt className="text-caption text-muted-foreground">{t(`page.${key}`)}</dt>
                  <dd className="script-leading whitespace-pre-line">{given(value)}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>
          <SectionCard title={t("contacts.title")}>
            <RefusalAlert error={changes.removeContact.error} />
            {data.contacts.length === 0 ? (
              <p className="text-muted-foreground">{t("contacts.none")}</p>
            ) : (
              <ItemGroup>
                {data.contacts.map((contact) => (
                  <Item key={contact.id} size="sm" role="listitem" className="items-start">
                    <ItemContent className="min-w-0">
                      <ItemTitle>{contact.name}</ItemTitle>
                      <ItemDescription>
                        {[contact.role, contact.whatsapp === "" ? "" : `WhatsApp ${contact.whatsapp}`, contact.email]
                          .filter((part) => part !== "")
                          .join(" · ")}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="flex-wrap">
                      {contact.phone !== "" && (
                        <Button variant="outline" asChild>
                          <a href={`tel:${contact.phone}`} aria-label={t("contacts.callNamed", { name: contact.name })}>
                            <PhoneIcon aria-hidden="true" />
                            <span className="numbers">{contact.phone}</span>
                          </a>
                        </Button>
                      )}
                      {mayEdit && (
                        <>
                          <ContactDialog supplierId={data.id} contact={contact} />
                          <Button
                            variant="ghost"
                            aria-label={t("contacts.removeNamed", { name: contact.name })}
                            onClick={() => {
                              setRemovingContact(contact.id);
                            }}
                          >
                            {t("contacts.remove")}
                          </Button>
                        </>
                      )}
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}
            {mayEdit && (
              <div>
                <ContactDialog supplierId={data.id} contact={null} />
              </div>
            )}
          </SectionCard>
          {data.costs !== null && (
            <SectionCard title={t("costs.title")}>
              <p className="text-muted-foreground">
                {t("costs.intro")}{" "}
                {data.owedPaise !== null && (
                  <span className="numbers font-semibold">
                    {t("costs.owed")}: {rupees(data.owedPaise)}
                  </span>
                )}
              </p>
              <RefusalAlert error={changes.linkCosts.error} />
              {data.costs.length === 0 ? (
                <p className="text-muted-foreground">{t("costs.none")}</p>
              ) : (
                <ItemGroup>
                  {data.costs.map((cost) => (
                    <Item key={cost.id} size="sm" role="listitem">
                      <ItemContent>
                        <ItemTitle>
                          {cost.quoteId !== null ? (
                            <TextLink inline href={quoteRoute(cost.quoteId)}>
                              {t("costs.forTitle", { title: cost.forTitle })}
                            </TextLink>
                          ) : cost.departureId !== null ? (
                            <TextLink inline href={departureRoute(cost.departureId)}>
                              {t("costs.forTitle", { title: cost.forTitle })}
                            </TextLink>
                          ) : (
                            cost.forTitle
                          )}
                        </ItemTitle>
                        <ItemDescription>
                          {[
                            tCategory(cost.category),
                            cost.paidOn === null
                              ? cost.dueOn === null
                                ? ""
                                : t("costs.dueOn", { day: formatCalendarDay(cost.dueOn) })
                              : t("costs.paidOn", { day: formatCalendarDay(cost.paidOn) }),
                            cost.note,
                          ]
                            .filter((part) => part !== "")
                            .join(" · ")}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <span className="numbers">{rupees(cost.amountPaise)}</span>
                        {cost.paidOn !== null && <StatusBadge tone="good">{t("costs.paid")}</StatusBadge>}
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
              {mayLink && mayEdit && data.linkableCosts !== null && data.linkableCosts > 0 && (
                <div className="flex flex-col gap-1">
                  <div>
                    <Button
                      variant="outline"
                      disabled={changes.linkCosts.isPending}
                      onClick={() => {
                        changes.linkCosts.mutate(
                          { supplierId: data.id },
                          { onSuccess: ({ linked }) => toast.success(t("costs.linked", { count: linked })) },
                        );
                      }}
                    >
                      {t("costs.link", { count: data.linkableCosts })}
                    </Button>
                  </div>
                  <p className="text-caption text-muted-foreground">{t("costs.linkHint")}</p>
                </div>
              )}
            </SectionCard>
          )}
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={t("page.deleteTitle")}
            description={t("page.deleteDescription")}
            action={t("page.delete")}
            request={changes.remove}
            onConfirm={() => {
              changes.remove.mutate(
                { supplierId: data.id },
                {
                  onSuccess: () => {
                    toast.success(t("page.deleted"));
                    router.push(routes.suppliers);
                  },
                },
              );
            }}
          />
          <ConfirmDialog
            open={removingContact !== null}
            onOpenChange={(next) => {
              if (!next) setRemovingContact(null);
            }}
            title={t("contacts.removeTitle")}
            description={t("contacts.removeDescription")}
            action={t("contacts.remove")}
            request={changes.removeContact}
            onConfirm={() => {
              if (removingContact === null) return;
              changes.removeContact.mutate(
                { contactId: removingContact },
                {
                  onSuccess: () => {
                    toast.success(t("contacts.removed"));
                    setRemovingContact(null);
                  },
                },
              );
            }}
          />
        </>
      );
    }
    if (refusalOf(supplier.error)?.reason === "NOT_FOUND") {
      return <EmptyState icon={SearchXIcon} message={t("page.notFound")} />;
    }
    if (supplier.isError) {
      return (
        <ErrorState
          message={t("page.loadFailed")}
          error={supplier.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void supplier.refetch()}
        />
      );
    }
    return <LoadingRows shape="twoLines" label={t("page.loading")} />;
  };
  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      {supplier.data === undefined && <BackLink href={routes.suppliers} label={t("page.back")} />}
      {body()}
    </div>
  );
}
