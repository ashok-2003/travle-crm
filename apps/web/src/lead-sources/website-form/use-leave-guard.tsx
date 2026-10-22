"use client";

// Leaving a page with unsaved changes asks once. The browser's own question covers closing the tab and reloading; a
// click on a link inside the app (the back link, the sidebar) is held here and put to the person with ConfirmDialog.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** A request that never goes out: ConfirmDialog asks for the shape of one. */
const noRequest = { isPending: false, isError: false, error: null, reset: () => undefined };

/** The address of an ordinary click on a link to another page of this app, or null (a new tab, a download, a hash). */
function appHrefOf(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = event.target instanceof Element ? event.target.closest("a") : null;
  if (link === null || link.target === "_blank" || link.hasAttribute("download")) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname) return null;
  return `${url.pathname}${url.search}`;
}

export function LeaveGuard({ dirty }: { dirty: boolean }) {
  const t = useTranslations("websiteFormSettings.save.leave");
  const router = useRouter();
  const [heldHref, setHeldHref] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const hold = (event: MouseEvent) => {
      const href = appHrefOf(event);
      if (href === null) return;
      event.preventDefault();
      event.stopPropagation();
      setHeldHref(href);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", hold, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", hold, true);
    };
  }, [dirty]);

  return (
    <ConfirmDialog
      open={heldHref !== null}
      onOpenChange={(open) => {
        if (!open) setHeldHref(null);
      }}
      title={t("title")}
      description={t("description")}
      action={t("leave")}
      request={noRequest}
      onConfirm={() => {
        if (heldHref !== null) router.push(heldHref);
        setHeldHref(null);
      }}
    />
  );
}
