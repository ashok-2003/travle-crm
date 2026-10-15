"use client";

// Registers the service worker once the page has finished loading (see register-service-worker.ts): its install
// fetches every screen's shell, which mustn't compete with the first page's own files on a slow connection.
import { useEffect } from "react";
import { registerServiceWorker } from "./register-service-worker";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    const register = () => {
      void registerServiceWorker(navigator, process.env.NODE_ENV);
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => {
      window.removeEventListener("load", register);
    };
  }, []);
  return null;
}
