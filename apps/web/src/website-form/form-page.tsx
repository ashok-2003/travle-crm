"use client";

// The hosted page and the embed (spec 3.5-3.8): asks the api for the form by its key and shows the form, the thank-you or
// the reason it cannot be used. Hosted is a column on the canvas, on a computer a panel on the surface tone; embedded has no
// padding, card or background so it takes the look of the page around it, and tells that page its height.
import { useRef, useState, type ReactNode } from "react";
import { FormLoadFailed, FormNotFound, FormUnavailable } from "./unavailable";
import { ThankYou } from "./thank-you";
import { useDocumentTitle } from "./use-document-title";
import { useEmbeddedHeight } from "./use-embedded-height";
import { usePublicForm } from "./use-public-form";
import { WaitingNote } from "./waiting-note";
import { WebsiteFormView } from "./website-form-view";

function Frame({ mode, children }: { mode: "hosted" | "embedded"; children: ReactNode }) {
  const frame = useRef<HTMLElement>(null);
  useEmbeddedHeight(frame, mode === "embedded");
  if (mode === "embedded") return <main ref={frame}>{children}</main>;
  return (
    <main ref={frame} className="flex min-h-dvh justify-center px-4 py-6 md:items-start md:py-12">
      <div className="w-full max-w-[560px] md:rounded-card md:bg-muted md:p-8">{children}</div>
    </main>
  );
}

export function FormPage({ formKey, mode }: { formKey: string; mode: "hosted" | "embedded" }) {
  const { loaded, send, retry } = usePublicForm(formKey, mode);
  const [sent, setSent] = useState(false);
  const embedded = mode === "embedded";
  useDocumentTitle(loaded.state === "ready" || loaded.state === "unavailable" ? loaded.form.organizationName : null);

  const content = (() => {
    switch (loaded.state) {
      case "loading":
      case "waking":
        return <WaitingNote waking={loaded.state === "waking"} />;
      case "not-found":
        return <FormNotFound />;
      case "failed":
        return <FormLoadFailed onRetry={retry} />;
      case "unavailable":
        return <FormUnavailable form={loaded.form} embedded={embedded} />;
      case "ready":
        return sent ? (
          <ThankYou form={loaded.form} embedded={embedded} />
        ) : (
          <WebsiteFormView
            form={loaded.form}
            mode={mode}
            send={async (body) => {
              await send(body);
              setSent(true);
            }}
          />
        );
    }
  })();
  return <Frame mode={mode}>{content}</Frame>;
}
