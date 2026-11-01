"use client";

// /suppliers (release 7a): the hotels, transport operators and guides the agency buys from, searched by name and narrowed by
// kind, each with its first contact to call. "What we owe" leads to the dues for whoever keeps the accounts.
import type { SupplierKind, SupplierSummary } from "@travel-crm/contracts/suppliers";
import { HandshakeIcon, PhoneIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { ShowMoreButton } from "@/components/show-more-button";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { routes, supplierRoute } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { useSupplierList } from "./use-suppliers";
import Link from "next/link";

const kinds = ["all", "hotel", "transport", "guide", "other"] as const;
type Filter = (typeof kinds)[number];

function SupplierRow({ supplier }: { supplier: SupplierSummary }) {
  const t = useTranslations("suppliers");
  return (
    <TableRow>
      <TableCell>
        <TextLink inline href={supplierRoute(supplier.id)}>
          {supplier.name}
        </TextLink>
        {supplier.city !== "" && <p className="text-caption text-muted-foreground">{supplier.city}</p>}
      </TableCell>
      <TableCell>{t(`kinds.${supplier.kind}`)}</TableCell>
      <TableCell>
        {supplier.contactName !== null && (
          <>
            {supplier.contactName}
            {supplier.contactPhone !== null && (
              <p>
                <a
                  className="numbers inline-flex min-h-11 items-center gap-1 text-primary underline-offset-4 hover:underline"
                  href={`tel:${supplier.contactPhone}`}
                  aria-label={t("list.call", { name: supplier.contactName })}
                >
                  <PhoneIcon aria-hidden="true" className="size-4" />
                  {supplier.contactPhone}
                </a>
              </p>
            )}
          </>
        )}
      </TableCell>
    </TableRow>
  );
}

export function SuppliersScreen() {
  const t = useTranslations("suppliers.list");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const mayCreate = useHolds("suppliers:create");
  const seesAccounts = useHolds("accounts:view");
  const [kind, setKind] = useState<Filter>("all");
  const [typed, setTyped] = useState("");
  const search = useDebouncedValue(typed.trim());
  const list = useSupplierList({
    ...(kind === "all" ? {} : { kind }),
    ...(search === "" ? {} : { search }),
  });
  const body = () => {
    if (list.items === undefined) {
      return list.isError ? (
        <ErrorState
          message={t("loadFailed")}
          error={list.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void list.refetch()}
        />
      ) : (
        <LoadingRows shape="table" columns={3} label={t("loading")} />
      );
    }
    if (list.items.length === 0) {
      return <EmptyState icon={HandshakeIcon} message={t(kind === "all" && search === "" ? "empty" : "noneHere")} />;
    }
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.supplier")}</TableHead>
              <TableHead>{t("columns.kind")}</TableHead>
              <TableHead>{t("columns.contact")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.map((supplier) => (
              <SupplierRow key={supplier.id} supplier={supplier} />
            ))}
          </TableBody>
        </Table>
        <ShowMoreButton pages={list} label={t("more")} />
      </>
    );
  };
  return (
    <div className="flex max-w-[1000px] flex-col gap-6">
      <PageHeader
        title={t("title")}
        intro={t("intro")}
        action={
          <div className="flex flex-wrap gap-2">
            {seesAccounts && (
              <Button variant="outline" asChild>
                <Link href={routes.supplierDues}>{t("owe")}</Link>
              </Button>
            )}
            {mayCreate && (
              <SupplierFormDialog
                supplier={null}
                trigger={{ label: t("new"), variant: "default" }}
                onSaved={(id) => {
                  router.push(supplierRoute(id));
                }}
              />
            )}
          </div>
        }
      />
      <Input
        type="search"
        value={typed}
        aria-label={t("searchLabel")}
        placeholder={t("search")}
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <ToggleGroup
        type="single"
        variant="outline"
        value={kind}
        onValueChange={(value) => {
          if (value !== "") setKind(value as Filter);
        }}
        aria-label={t("filterLabel")}
        className="flex-wrap"
      >
        {kinds.map((one) => (
          <ToggleGroupItem key={one} value={one} className="min-h-11 px-4">
            {one === "all" ? t("kindAll") : <KindName kind={one} />}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {body()}
    </div>
  );
}

function KindName({ kind }: { kind: SupplierKind }) {
  const t = useTranslations("suppliers.kinds");
  return <>{t(kind)}</>;
}
