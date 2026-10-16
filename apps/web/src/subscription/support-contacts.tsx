// How to reach the platform's support (spec 10: the brand's email and phone), for an organization whose subscription
// shuts its screens. The phone reads as Indians write it, "+91 98765 43210", in mono (DESIGN.md section 9).
import { brand } from "@travel-crm/brand";
import { MailIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";

/** An Indian number in E.164 ("+919876543210") as "+91 98765 43210"; any other as it is stored. */
function formatPhone(phone: string): string {
  return phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");
}

const linkClasses =
  "flex min-h-11 items-center gap-3 px-4 py-2 text-primary underline-offset-4 hover:underline focus-visible:underline";

export function SupportContacts() {
  const t = useTranslations("subscription.locked");
  return (
    <section aria-labelledby="support-heading" className="flex flex-col gap-3">
      <h2 id="support-heading" className="text-section font-semibold">
        {t("contactHeading")}
      </h2>
      <ul className="divide-y rounded-lg border">
        <li>
          <a href={`mailto:${brand.supportEmail}`} className={linkClasses}>
            <MailIcon aria-hidden="true" className="size-5 shrink-0" />
            <span className="break-all">{brand.supportEmail}</span>
          </a>
        </li>
        <li>
          <a href={`tel:${brand.supportPhone}`} className={linkClasses}>
            <PhoneIcon aria-hidden="true" className="size-5 shrink-0" />
            <span className="numbers">{formatPhone(brand.supportPhone)}</span>
          </a>
        </li>
      </ul>
    </section>
  );
}
