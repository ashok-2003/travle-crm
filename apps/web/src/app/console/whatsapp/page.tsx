// /console/whatsapp: the WhatsApp numbers agencies use through MSG91, and the webhook block for MSG91's panel.
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WhatsappScreen } from "@/console/whatsapp/whatsapp-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("consoleWhatsapp");
  return { title: t("title") };
}

export default function ConsoleWhatsappPage() {
  return <WhatsappScreen />;
}
