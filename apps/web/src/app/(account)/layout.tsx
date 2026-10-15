// The frame of the screens outside the app shell (signing in, passwords, two-factor): the product's name and one
// narrow column, centred on wide screens and edge to edge with a 16px gutter on phones.
import { brand } from "@travel-crm/brand";
import Image from "next/image";
import type { ReactNode } from "react";

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <main className="flex w-full max-w-sm flex-col gap-8">
        <p className="flex items-center gap-2 text-section font-semibold">
          {/* The brand's mark, which the build copies to /icons; the name next to it says what it is. */}
          <Image src="/icons/favicon.svg" alt="" width={28} height={28} />
          {brand.productName}
        </p>
        {children}
      </main>
    </div>
  );
}
