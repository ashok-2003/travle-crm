"use client";

// An email as it was sent (the failed-emails spec): its HTML in a sandboxed frame with no permissions, so nothing in it
// runs and nothing can navigate, the page's or the frame's own, and the plain text beside it. Links included, which is
// why only super admins open it.
import type { StoredEmail } from "@travel-crm/contracts/platform";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

export function EmailAsSent({ email }: { email: Pick<StoredEmail, "subject" | "htmlBody" | "textBody"> }) {
  const t = useTranslations("consolePlatform.emails.email");
  return (
    <>
      <section aria-labelledby="email-as-sent" className="flex flex-col gap-3">
        <h2 id="email-as-sent" className="text-section font-semibold">
          {t("asSent")}
        </h2>
        <p className="max-w-[65ch] text-caption text-muted-foreground">{t("asSentHint")}</p>
        <Card className="py-0">
          <iframe
            sandbox=""
            srcDoc={email.htmlBody}
            title={t("frameTitle", { subject: email.subject })}
            referrerPolicy="no-referrer"
            className="block h-[36rem] w-full bg-canvas"
          />
        </Card>
      </section>
      <section aria-labelledby="email-text" className="flex flex-col gap-3">
        <h2 id="email-text" className="text-section font-semibold">
          {t("text")}
        </h2>
        <Card>
          <CardContent>
            <pre className="font-sans text-label whitespace-pre-wrap wrap-anywhere">{email.textBody}</pre>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
