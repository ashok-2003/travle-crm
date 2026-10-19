"use client";

// Copies a value an admin hands over (a temporary password, the organization code) and says so.
import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label, iconOnly = false }: { value: string; label: string; iconOnly?: boolean }) {
  const t = useTranslations("staff.create");
  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : "default"}
      aria-label={label}
      onClick={() => {
        // Clipboard access can be refused (no permission, an insecure page): say so rather than appear to work.
        void (async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast.success(t("copied"));
          } catch {
            toast.error(t("copyFailed"));
          }
        })();
      }}
    >
      <CopyIcon aria-hidden="true" />
      {!iconOnly && t("copy")}
    </Button>
  );
}
