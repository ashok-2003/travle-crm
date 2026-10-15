"use client";

// Copies a value an admin hands over (a temporary password, the organization code) and says so.
import { CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("staff.create");
  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => toast.success(t("copied")));
      }}
    >
      <CopyIcon aria-hidden="true" />
      {t("copy")}
    </Button>
  );
}
