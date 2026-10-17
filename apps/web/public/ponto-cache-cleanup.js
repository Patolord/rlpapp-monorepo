/* Remove páginas do ponto e fotos de marcação que versões anteriores do
 * service worker possam ter guardado nos caches genéricos ("pages"/"media"). */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (
            /^\/rh\/ponto(?:\/|$)/.test(url.pathname) ||
            url.pathname.startsWith("/time-clock/photo/") ||
            /(^|\.)rhid\.com\.br$/.test(url.hostname)
          ) {
            await cache.delete(request);
          }
        }
      }
    })()
  );
});
