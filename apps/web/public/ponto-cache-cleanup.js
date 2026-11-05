/* Remove páginas do ponto que versões anteriores do service worker possam
 * ter guardado no cache genérico de páginas ("pages"). */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const url = new URL(request.url);
          if (/^\/rh\/ponto(?:\/|$)/.test(url.pathname)) {
            await cache.delete(request);
          }
        }
      }
    })()
  );
});
