"use client";

// The Facebook and Instagram lead ads group of /settings/lead-sources (spec 3.1): the connected Pages, each with how many
// forms it brings in, when it was last checked and its badge, and Connect a Page, which is off at the limit, where Meta
// isn't set up, in the demo and while the subscription refuses changes, each with the reason as the button's description.
// It loads on its own, so Google Sheets above it works whether or not this does.
import { Fragment, useId } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { LoadFailedAlert } from "@/components/load-failed-alert";
import { LoadingRows } from "@/components/loading-rows";
import { TextLink } from "@/components/text-link";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { metaConnectRoute, metaPageRoute } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { useWriteAccess } from "@/subscription/write-access";
import { WriteHint } from "@/subscription/write-hint";
import { lastCheckedText } from "../last-checked";
import { MetaBadge } from "./meta-badge";
import { useMetaPages } from "./use-meta-pages";

export function MetaPagesGroup() {
  const t = useTranslations("metaLeads.list");
  const pages = useMetaPages();
  const write = useWriteAccess("change");
  const hintId = useId();
  const { timeZone } = useMe().organization;
  const list = pages.data;

  /** Why Connect a Page is off, if it is: ours first, then the subscription's. */
  const reason =
    list === undefined
      ? null
      : !list.configured
        ? t("notSetUp")
        : list.demo
          ? t("demo")
          : list.items.length >= list.limit
            ? t("limitHint", { limit: list.limit })
            : null;
  const off = list === undefined || reason !== null || !write.allowed;

  const body = () => {
    if (list === undefined) {
      if (pages.isError) {
        return <LoadFailedAlert message={t("loadFailed")} error={pages.error} onRetry={() => void pages.refetch()} />;
      }
      return <LoadingRows rows={2} shape="twoLines" />;
    }
    if (list.items.length === 0) return <p className="text-muted-foreground">{t("empty")}</p>;
    return (
      <ItemGroup aria-label={t("listLabel")}>
        {list.items.map((page, index) => (
          <Fragment key={page.id}>
            {index > 0 && <ItemSeparator />}
            <Item size="sm" role="listitem" className="items-start">
              <ItemContent className="min-w-0">
                <ItemTitle className="flex-wrap wrap-anywhere script-leading">
                  <TextLink href={metaPageRoute(page.id)} inline>
                    {page.pageName}
                  </TextLink>
                </ItemTitle>
                <ItemDescription className="wrap-anywhere script-leading">
                  {t("formsBroughtIn", { count: page.formsBroughtIn })} ·{" "}
                  {page.lastCheckedAt === null
                    ? t("notChecked")
                    : t("lastChecked", { when: lastCheckedText(new Date(page.lastCheckedAt), { timeZone }) })}
                </ItemDescription>
              </ItemContent>
              <MetaBadge badge={page.badge} />
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
    );
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="meta-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-3">
        <div className="flex items-baseline gap-3">
          <h2 id="meta-heading" className="text-section font-semibold">
            {t("heading")}
          </h2>
          {list !== undefined && (
            <span className="numbers text-label text-muted-foreground">
              {t("count", { count: list.items.length, limit: list.limit })}
            </span>
          )}
        </div>
        {list !== undefined && (
          <div className="flex flex-col items-start gap-2">
            {off ? (
              <Button
                variant="outline"
                disabled
                aria-describedby={reason !== null || write.hint !== null ? hintId : undefined}
              >
                {t("connect")}
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href={metaConnectRoute}>{t("connect")}</Link>
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="max-w-[65ch] text-muted-foreground">{t("intro")}</p>
      {reason === null ? (
        <WriteHint id={hintId} hint={write.hint} />
      ) : (
        <FieldDescription id={hintId} className="max-w-[40ch]">
          {reason}
        </FieldDescription>
      )}
      {body()}
    </section>
  );
}
