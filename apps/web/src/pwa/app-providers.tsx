"use client";

// The data layer and the service worker's registration around every page but the visitor's form (W29, ruling F3): the form
// opens no IndexedDB, saves no query cache and registers no worker, so it keeps nothing on a visitor's device.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DataProviders } from "@/data/providers";
import { isPublicFormPath } from "@/lib/routes";
import { ServiceWorkerRegistration } from "./service-worker-registration";

export function AppProviders({ children }: { children: ReactNode }) {
  if (isPublicFormPath(usePathname())) return children;
  return (
    <>
      <DataProviders>{children}</DataProviders>
      <ServiceWorkerRegistration />
    </>
  );
}
