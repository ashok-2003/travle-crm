"use client";

// The supplier picker of a cost (release 7a): the shared SearchCombobox over the suppliers the agency keeps, searched as the
// person types, with 'Add "Hotel X"' to keep a new one on the spot. Nothing chosen is fine: the cost keeps the name typed.
import { PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FormField } from "@/components/form-field";
import { SearchCombobox, useComboboxSearch } from "@/components/search-combobox";
import { useTRPC } from "@/data/trpc";
import { useHolds } from "@/session/me-context";
import { useSupplierChanges } from "./use-suppliers";

/** A supplier as the form keeps it. */
export interface PickedSupplier {
  id: string;
  name: string;
}

const isPicked = (value: unknown): value is PickedSupplier =>
  typeof value === "object" && value !== null && "id" in value && "name" in value;

const tidy = (name: string) => name.trim().replace(/\s+/g, " ");

export function SupplierField<Values extends FieldValues>({
  control,
  name,
  kind,
}: {
  control: Control<Values>;
  name: FieldPath<Values>;
  /** The kind a supplier added here gets, from the cost's category. */
  kind: "hotel" | "transport" | "guide" | "other";
}) {
  const t = useTranslations("suppliers.picker");
  const trpc = useTRPC();
  const mayAdd = useHolds("suppliers:create");
  const { field, fieldState } = useController({ control, name });
  const value: unknown = field.value;
  const chosen = isPicked(value) ? value : null;
  const search = useComboboxSearch(0);
  const found = useQuery(
    trpc.suppliers.list.queryOptions(
      { ...(search.query === "" ? {} : { search: search.query }) },
      { enabled: search.open, placeholderData: keepPreviousData, select: (page) => page.items },
    ),
  );
  const { create } = useSupplierChanges();
  const newName = tidy(search.typed);
  const listed = found.data?.some((supplier) => supplier.name.toLowerCase() === newName.toLowerCase());
  return (
    <FormField label={t("label")} hint={t("hint")} error={fieldState.error?.message}>
      {(links) => (
        <SearchCombobox
          links={links}
          triggerRef={field.ref}
          search={search}
          results={found}
          chosen={chosen}
          words={{
            none: t("none"),
            search: t("search"),
            searching: t("searching"),
            noMatch: t("noMatch"),
          }}
          optionId={(supplier) => supplier.id}
          renderOption={(supplier) => <span className="script-leading">{supplier.name}</span>}
          onChoose={(supplier) => {
            field.onChange(supplier === null ? null : { id: supplier.id, name: supplier.name });
          }}
          clearLabel={t("clear")}
          extraOption={
            mayAdd && newName !== "" && listed !== true
              ? {
                  label: (
                    <>
                      <PlusIcon aria-hidden="true" />
                      {t("add", { name: newName })}
                    </>
                  ),
                  onSelect: () => {
                    create.mutate(
                      { kind, name: newName, city: "", gstin: "", paymentTerms: "", paymentDetails: "", notes: "" },
                      {
                        onSuccess: ({ id }) => {
                          field.onChange({ id, name: newName });
                          toast.success(t("added", { name: newName }));
                        },
                      },
                    );
                  },
                }
              : undefined
          }
        />
      )}
    </FormField>
  );
}
