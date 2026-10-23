"use client";

// Step 2 of connecting (spec 3.2): the Pages the person shared at Facebook, each a Checkbox with what can be done with
// it: ready to connect, already connected here, held by another agency, or one they can't advertise on (the last three
// are shown but not tickable). Connect N Pages subscribes the ticked ones. At most five Pages in all (one constant).
import { MAX_META_PAGES, type MetaConnectFinished } from "@travel-crm/contracts/meta-leads";
import { useTranslations } from "next-intl";
import { Fragment, useId } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { WriteHint } from "@/subscription/write-hint";

type SharedPage = MetaConnectFinished["pages"][number];

export function ChoosePages({
  pages,
  ticked,
  onTick,
  busy,
  writeHint,
  allowed,
  onConnect,
}: {
  pages: readonly SharedPage[];
  ticked: ReadonlySet<string>;
  onTick: (pageId: string, on: boolean) => void;
  busy: boolean;
  writeHint: string | null;
  allowed: boolean;
  onConnect: () => void;
}) {
  const t = useTranslations("metaLeads.callback");
  const hintId = useId();
  const connectable = pages.filter((page) => page.availability === "available");
  return (
    <div className="flex flex-col gap-4">
      {connectable.length === 0 ? (
        <p>{t("none")}</p>
      ) : (
        <p className="text-label text-muted-foreground">{t("limit", { limit: MAX_META_PAGES })}</p>
      )}
      <ItemGroup aria-label={t("listLabel")}>
        {pages.map((page, index) => {
          const available = page.availability === "available";
          const id = `meta-page-${page.pageId}`;
          return (
            <Fragment key={page.pageId}>
              {index > 0 && <ItemSeparator />}
              <Item size="sm" role="listitem" className="min-h-11">
                <ItemMedia>
                  <Checkbox
                    id={id}
                    aria-describedby={`${id}-state`}
                    checked={available && ticked.has(page.pageId)}
                    disabled={!available || busy}
                    onCheckedChange={(on) => {
                      onTick(page.pageId, on === true);
                    }}
                  />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="wrap-anywhere script-leading">
                    <Label htmlFor={id}>{page.name}</Label>
                  </ItemTitle>
                  <ItemDescription id={`${id}-state`}>{t(page.availability)}</ItemDescription>
                </ItemContent>
              </Item>
            </Fragment>
          );
        })}
      </ItemGroup>
      <div className="flex flex-col items-start gap-2">
        <Button
          disabled={busy || ticked.size === 0 || !allowed}
          aria-describedby={writeHint ? hintId : undefined}
          onClick={onConnect}
        >
          {busy && <Spinner />}
          {busy ? t("connecting") : t("connect", { count: ticked.size })}
        </Button>
        <WriteHint id={hintId} hint={writeHint} />
      </div>
    </div>
  );
}
