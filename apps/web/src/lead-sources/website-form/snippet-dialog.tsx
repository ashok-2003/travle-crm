"use client";

// The snippet for the agency's website (spec 3.3): the script (recommended) and the iframe as two tabs, each a code
// block with its copy button, for the app's own address and the form's key. With the website switch off it says the
// snippet is off and offers the switch, since a form pasted now would show nothing.
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/copy-button";
import type { ReturnFocusTo } from "@/components/return-focus";
import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Both come from the api's own embed address (APP_URL), the one the Link field shows, never the browser's host. */
export const scriptSnippet = (embedLink: string, key: string) =>
  `<script src="${new URL(embedLink).origin}/embed.js" data-form="${key}" async></script>`;
export const iframeSnippet = (embedLink: string) =>
  `<iframe src="${embedLink}" title="Enquiry form" width="100%" height="760" style="border:0" loading="lazy"></iframe>`;

function Snippet({ text, copyLabel, help }: { text: string; copyLabel: string; help: string }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <pre className="w-full overflow-x-auto rounded-sm bg-muted p-3 text-label">
        <code className="numbers whitespace-pre-wrap break-all">{text}</code>
      </pre>
      <CopyButton value={text} label={copyLabel} />
      <FieldDescription>{help}</FieldDescription>
    </div>
  );
}

export function SnippetDialog({
  open,
  onOpenChange,
  returnFocusTo,
  formKey,
  embedLink,
  allowEmbed,
  savedAllowEmbed,
  onAllowEmbed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocusTo: ReturnFocusTo;
  formKey: string;
  embedLink: string;
  /** The website switch as the page has it now, saved or not. */
  allowEmbed: boolean;
  savedAllowEmbed: boolean;
  onAllowEmbed: (allow: boolean) => void;
}) {
  const t = useTranslations("websiteFormSettings.snippet");
  const tShare = useTranslations("websiteFormSettings.share");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      returnFocusTo={returnFocusTo}
      title={t("title")}
      description={t("description")}
      cancel={false}
      footer={
        <Button
          type="button"
          onClick={() => {
            onOpenChange(false);
          }}
        >
          {t("done")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {allowEmbed ? (
          <>
            <Tabs defaultValue="script">
              <TabsList>
                <TabsTrigger value="script">{t("script")}</TabsTrigger>
                <TabsTrigger value="iframe">{t("iframe")}</TabsTrigger>
              </TabsList>
              <TabsContent value="script">
                <Snippet text={scriptSnippet(embedLink, formKey)} copyLabel={t("copyScript")} help={t("scriptHelp")} />
              </TabsContent>
              <TabsContent value="iframe">
                <Snippet text={iframeSnippet(embedLink)} copyLabel={t("copyIframe")} help={t("iframeHelp")} />
              </TabsContent>
            </Tabs>
            <FieldDescription>{t("works")}</FieldDescription>
          </>
        ) : (
          <FieldDescription>{t("off")}</FieldDescription>
        )}
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="snippet-allow-embed">{tShare("embed")}</Label>
          <Switch id="snippet-allow-embed" checked={allowEmbed} onCheckedChange={onAllowEmbed} />
        </div>
        {allowEmbed !== savedAllowEmbed && <FieldDescription>{t("saveToApply")}</FieldDescription>}
      </div>
    </ResponsiveDialog>
  );
}
