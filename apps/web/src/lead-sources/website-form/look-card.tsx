"use client";

// How the form looks (spec 3.2, item 5): the logo, name and colour it uses, read from the business profile and the
// branding, which are changed there. With no logo the form shows the name in text. A colour too light for white text
// falls back to the product's blue (the note says so).
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Details } from "@/components/details";
import { TextLink } from "@/components/text-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";

export function LookCard() {
  const t = useTranslations("websiteFormSettings.look");
  const trpc = useTRPC();
  const { name } = useMe().organization;
  const logo = useQuery(trpc.organization.logo.get.queryOptions());
  const branding = useQuery(trpc.organization.branding.get.queryOptions());
  const colour = branding.data?.brandColour ?? null;
  const logoValue =
    logo.data === undefined ? undefined : logo.data === null ? (
      <span className="font-normal text-muted-foreground">{t("noLogo")}</span>
    ) : (
      <span className="relative block h-10 w-32">
        {/* Unoptimized: the link is storage's own, signed and short-lived. */}
        <Image
          src={logo.data.url}
          alt={t("logoAlt")}
          fill
          unoptimized
          sizes="128px"
          className="object-contain object-left"
        />
      </span>
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <CardDescription>{t("colourNote")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Details
          rows={[
            {
              label: t("logo"),
              value: logoValue,
            },
            { label: t("name"), value: name },
            {
              label: t("colour"),
              value: colour === null ? t("noColour") : <span className="numbers">{colour}</span>,
            },
          ]}
        />
        <TextLink href={routes.profile}>{t("changeProfile")}</TextLink>
        <TextLink href={routes.branding}>{t("changeBranding")}</TextLink>
      </CardContent>
    </Card>
  );
}
