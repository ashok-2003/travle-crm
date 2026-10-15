// /account: the signed-in person's own details, password and two-factor sign-in.
import type { Metadata } from "next";
import { AccountScreen } from "@/account/account-screen";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return <AccountScreen />;
}
