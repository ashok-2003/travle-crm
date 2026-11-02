"use client";

// The all-packages page's list (release 7b): the agency's published packages, narrowed by place (chips) and by a word typed in
// the search box. The search is held in the tab only, never in the address (a page's address reaches logs and the Referer).
import type { PublicPackageList } from "@travel-crm/contracts/package-pages";
import { money } from "@travel-crm/domain/kernel";
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatRupees } from "@/lib/format";

const ALL = "all";

export function PackageFilter({ list }: { list: PublicPackageList }) {
  const t = useTranslations("packagePages");
  const [place, setPlace] = useState(ALL);
  const [typed, setTyped] = useState("");
  const word = typed.trim().toLowerCase();
  const shown = list.packages.filter(
    (one) =>
      (place === ALL || one.destinationId === place) &&
      (word === "" ||
        one.name.toLowerCase().includes(word) ||
        (one.destinationName ?? "").toLowerCase().includes(word) ||
        one.summary.toLowerCase().includes(word)),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            placeholder={t("list.searchPlaceholder")}
            aria-label={t("list.search")}
            autoComplete="off"
          />
        </InputGroup>
        {list.destinations.length > 0 && (
          <ToggleGroup
            type="single"
            variant="outline"
            value={place}
            onValueChange={(value) => {
              if (value !== "") setPlace(value);
            }}
            aria-label={t("list.filters")}
            className="flex-wrap"
          >
            <ToggleGroupItem value={ALL} className="min-h-11 px-4">
              {t("list.allPlaces")}
            </ToggleGroupItem>
            {list.destinations.map((destination) => (
              <ToggleGroupItem key={destination.id} value={destination.id} className="min-h-11 px-4">
                {destination.name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
      {list.packages.length === 0 ? (
        <p className="text-muted-foreground">{t("list.none")}</p>
      ) : shown.length === 0 ? (
        <p role="status" className="text-muted-foreground">
          {t("list.noMatch")}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((one) => (
            <li key={one.slug}>
              <Card className="h-full">
                {one.photoUrl !== null && (
                  // A presigned link to storage, which Next's image optimiser can't fetch.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={one.photoUrl} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                )}
                <CardHeader>
                  <CardTitle>
                    <h2 className="[overflow-wrap:anywhere]">{one.name}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex h-full flex-col gap-3">
                  <p className="text-muted-foreground">
                    {[one.nights === null ? null : t("page.nights", { count: one.nights }), one.destinationName]
                      .filter((fact) => fact !== null)
                      .join(" · ")}
                  </p>
                  <p className="line-clamp-3 [overflow-wrap:anywhere]">{one.summary}</p>
                  <p className="numbers font-semibold">
                    {one.fromPricePaise === null
                      ? t("page.onEnquiry")
                      : t("page.fromPrice", { price: formatRupees(money(one.fromPricePaise)) })}
                  </p>
                  <div className="mt-auto">
                    <Button variant="outline" asChild>
                      <Link href={`/a/${list.agency.code}/${one.slug}`}>
                        {t("list.open")}
                        <span className="sr-only"> {one.name}</span>
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
