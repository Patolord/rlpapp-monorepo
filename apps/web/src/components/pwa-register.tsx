import { useEffect } from "react";

/**
 * Registra o service worker do PWA no cliente (SSR-safe).
 * Com injectRegister: false no vite-plugin-pwa, o registro é manual.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    void import("virtual:pwa-register").then(({ registerSW }) => {
      registerSW({ immediate: true });
    });
  }, []);

  return null;
}
