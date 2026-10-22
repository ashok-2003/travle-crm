// "/" is not a page of its own: the signed-in person's home is the dashboard, and anyone not signed in is sent to
// sign in from there. Phones that installed the app when home was "/" still open it.
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";

export default function RootPage(): never {
  redirect(routes.home);
}
