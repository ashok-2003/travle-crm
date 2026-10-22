"use client";

// The Website form section of Lead sources (spec 3.1): one Item, linking to the form's page, with a badge that says On
// (green), Off (neutral) or Unavailable (amber, when the subscription or the plan closes it). Only for members who may
// manage settings, the form's own permission; a state that didn't load still leaves the link.
import { ClipboardListIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { routes } from "@/lib/routes";
import { useHolds } from "@/session/me-context";
import { useWebsiteFormView } from "./use-website-form";

/** Only for members the api would answer: it needs both permissions, so nobody else sends the request. */
export function WebsiteFormRow() {
  const manages = useHolds("settings:manage");
  const adds = useHolds("leads:create");
  return manages && adds ? <AllowedRow /> : null;
}

function AllowedRow() {
  const t = useTranslations("websiteFormSettings.row");
  const query = useWebsiteFormView();

  const state = query.data?.state;
  const kind = state === undefined ? null : state.open ? "on" : state.reason === "off" ? "off" : "unavailable";
  const tone: StatusTone = kind === "on" ? "good" : kind === "unavailable" ? "attention" : "neutral";

  return (
    <section className="flex flex-col gap-3" aria-labelledby="website-form-heading">
      <h2 id="website-form-heading" className="text-section font-semibold">
        {t("heading")}
      </h2>
      <ItemGroup>
        <div role="listitem">
          <Item asChild size="sm">
            <Link href={routes.websiteForm}>
              <ItemMedia variant="icon">
                <ClipboardListIcon aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{t("title")}</ItemTitle>
                {kind !== null && <ItemDescription>{t(kind)}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                {kind !== null ? (
                  <StatusBadge tone={tone}>{t(`badges.${kind}`)}</StatusBadge>
                ) : query.isError ? null : (
                  <Skeleton className="h-6 w-16" />
                )}
              </ItemActions>
            </Link>
          </Item>
        </div>
      </ItemGroup>
    </section>
  );
}
