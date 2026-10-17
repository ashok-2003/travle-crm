// Renders the leads' shared pieces as a signed-in member of an agency in India sees them: the app's messages and the
// member, whose organization's zone the pieces read.
import { render, renderHook } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { locale, messages } from "@/i18n/messages";
import { MeProvider } from "@/session/me-context";
import { member } from "../support/members";

function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Kolkata">
      <MeProvider me={member({ isOwner: true })}>{children}</MeProvider>
    </NextIntlClientProvider>
  );
}

export function renderPiece(ui: ReactNode) {
  return render(ui, { wrapper: Providers });
}

export function renderPieceHook<Result>(hook: () => Result) {
  return renderHook(hook, { wrapper: Providers });
}
