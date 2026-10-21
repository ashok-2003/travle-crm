// How to reach us: sales for plans and demos, the tech team for help, each by call, WhatsApp and email. The numbers
// and addresses are the brand's (spec 10), shown as Indians write a phone (DESIGN.md section 9).
import { brand } from "@travel-crm/brand";
import { MailIcon, MessageCircleIcon, PhoneIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { formatPhoneNumber } from "@/lib/format";
import { callLink, emailLink, whatsAppLink } from "./contact-links";
import { MarketingSection } from "./section";

const teams = [
  { key: "sales", contact: brand.salesContact },
  { key: "tech", contact: brand.techContact },
] as const;

function ContactLink({
  href,
  icon: Icon,
  label,
  external = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  external?: boolean;
}) {
  return (
    <div role="listitem">
      <Item size="sm" asChild>
        <a href={href} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
          <ItemMedia variant="icon">
            <Icon aria-hidden="true" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="break-all">{label}</ItemTitle>
          </ItemContent>
        </a>
      </Item>
    </div>
  );
}

export function ContactSection() {
  const t = useTranslations("marketing.contact");
  return (
    <MarketingSection id="contact" title={t("title")}>
      <div className="grid gap-4 md:grid-cols-2">
        {teams.map(({ key, contact }) => {
          const phone = formatPhoneNumber(contact.phone);
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{t(`${key}.title`)}</CardTitle>
                <CardDescription>{t(`${key}.detail`)}</CardDescription>
              </CardHeader>
              <CardContent>
                <ItemGroup>
                  <ContactLink href={callLink(contact.phone)} icon={PhoneIcon} label={t("call", { phone })} />
                  <ItemSeparator />
                  <ContactLink
                    href={whatsAppLink(contact.phone)}
                    icon={MessageCircleIcon}
                    label={t("whatsapp", { phone })}
                    external
                  />
                  <ItemSeparator />
                  <ContactLink
                    href={emailLink(contact.email)}
                    icon={MailIcon}
                    label={t("email", { email: contact.email })}
                  />
                </ItemGroup>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </MarketingSection>
  );
}
