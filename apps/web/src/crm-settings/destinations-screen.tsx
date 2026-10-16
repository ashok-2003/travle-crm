"use client";

// Destinations in Settings (spec 3.6): the agency's own list, alphabetically, searched by part of a name (forgiving of
// typos, as the api searches), each with its actions: rename, or merge into another. The api lists 100 at once; past
// that, the screen says to search.
import { MapPinIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BackToSettings } from "@/components/back-to-settings";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { LoadingRows } from "@/components/loading-rows";
import { PageHeader } from "@/components/page-header";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item";
import { DestinationActions } from "./destination-actions";
import { LISTED, useDestinations } from "./use-destinations";

/** destinations.search takes at most 80 characters. */
const LONGEST_SEARCH = 80;

export function DestinationsScreen() {
  const t = useTranslations("settings.destinations");
  const tCommon = useTranslations("common");
  const [search, setSearch] = useState("");
  const query = search.trim();
  const listed = useDestinations(query);

  const body = () => {
    if (listed.data) {
      if (listed.data.length === 0) {
        return query === "" ? (
          <EmptyState icon={MapPinIcon} message={t("empty")} />
        ) : (
          <p className="text-muted-foreground">{t("noMatch")}</p>
        );
      }
      return (
        <div className="flex flex-col gap-3">
          <ItemGroup aria-label={t("listLabel")}>
            {listed.data.map((destination) => (
              <Item key={destination.id} size="sm" role="listitem">
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-words script-leading">{destination.name}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <DestinationActions destination={destination} />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
          {listed.data.length === LISTED && <p className="text-label text-muted-foreground">{t("firstOnly")}</p>}
        </div>
      );
    }
    if (listed.isError) {
      return (
        <ErrorState
          message={t("loadFailed")}
          error={listed.error}
          retryLabel={tCommon("tryAgain")}
          onRetry={() => void listed.refetch()}
        />
      );
    }
    return <LoadingRows rows={5} />;
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackToSettings />
      <PageHeader title={t("title")} intro={t("intro")} />
      <FormField label={t("search")}>
        {(links) => (
          <InputGroup>
            <InputGroupInput
              {...links}
              type="search"
              maxLength={LONGEST_SEARCH}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
          </InputGroup>
        )}
      </FormField>
      {body()}
    </div>
  );
}
