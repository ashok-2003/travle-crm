"use client";

// Registers the service worker once the page has loaded (see register-service-worker.ts).
import { useEffect } from "react";
import { registerServiceWorker } from "./register-service-worker";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    void registerServiceWorker(navigator, process.env.NODE_ENV);
  }, []);
  return null;
}
