/* Retire attendance entries potentially saved by an older generic PWA rule. */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (/^\/rh\/ponto(?:\/|$)/.test(url.pathname) || url.pathname === "/attendance/photo") {
          await cache.delete(request);
        }
      }
    }
  })());
});
