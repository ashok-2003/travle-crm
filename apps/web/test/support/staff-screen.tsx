// A screen for tests of the data layer: who is signed in and the staff list, as one line ("Asha: Ravi, Meera"), with
// every text it ever rendered kept in order, so a test can say what was never on screen, not only what is now.
import { useQuery } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { DataProviders } from "@/data/providers";
import { useTRPC } from "@/data/trpc";
import { locale, messages } from "@/i18n/messages";

/** Everything StaffScreen rendered since the last forgetRenders(). */
export const rendered: string[] = [];

export function forgetRenders(): void {
  rendered.length = 0;
}

export function StaffScreen() {
  const trpc = useTRPC();
  const me = useQuery(trpc.me.get.queryOptions());
  const staff = useQuery(trpc.staff.list.queryOptions());
  const text =
    me.data && staff.data ? `${me.data.user.name}: ${staff.data.map((person) => person.name).join(", ")}` : "loading";
  rendered.push(text);
  return <p>{text}</p>;
}

/** The app's data layer around StaffScreen, and anything else given (a sign-out button), with the app's words. */
export function renderApp(extra?: ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DataProviders>
        <StaffScreen />
        {extra}
      </DataProviders>
    </NextIntlClientProvider>,
  );
}
