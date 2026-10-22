// The agency's way back to its own website, once the visitor is done or cannot use the form. In the embed it leaves the
// frame, not just the box (target _top, spec 3.6).
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function WebsiteButton({ url, text, embedded }: { url: string | null; text: string | null; embedded: boolean }) {
  const t = useTranslations("websiteForm.page");
  if (url === null) return null;
  return (
    <Button asChild>
      <a href={url} target={embedded ? "_top" : "_self"} rel="noopener noreferrer">
        {text ?? t("visitWebsite")}
      </a>
    </Button>
  );
}
