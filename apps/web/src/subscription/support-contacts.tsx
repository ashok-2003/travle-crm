// How to reach the platform's support (spec 10: the brand's email and phone), for an organization whose subscription
// shuts its screens. The phone reads as Indians write it, "+91 98765 43210", in mono (DESIGN.md section 9).
import { brand } from "@travel-crm/brand";
import { MailIcon, PhoneIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";

/** An Indian number in E.164 ("+919876543210") as "+91 98765 43210"; any other as it is stored. */
function formatPhone(phone: string): string {
  return phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2");
}

export function SupportContacts() {
  const t = useTranslations("subscription.locked");
  return (
    <section aria-labelledby="support-heading" className="flex flex-col gap-3">
      <h2 id="support-heading" className="text-section font-semibold">
        {t("contactHeading")}
      </h2>
      <ItemGroup>
        <div role="listitem">
          <Item size="sm" asChild>
            <a href={`mailto:${brand.supportEmail}`}>
              <ItemMedia variant="icon">
                <MailIcon aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="break-all">{brand.supportEmail}</ItemTitle>
              </ItemContent>
            </a>
          </Item>
        </div>
        <ItemSeparator />
        <div role="listitem">
          <Item size="sm" asChild>
            <a href={`tel:${brand.supportPhone}`}>
              <ItemMedia variant="icon">
                <PhoneIcon aria-hidden="true" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="numbers">{formatPhone(brand.supportPhone)}</ItemTitle>
              </ItemContent>
            </a>
          </Item>
        </div>
      </ItemGroup>
    </section>
  );
}
