// Service worker do app instalado.
// Rede primeiro: com internet, sempre a versão mais nova do GitHub Pages; a cópia guardada só abre a casca sem rede.
// Só arquivos do próprio site passam por aqui. Supabase, fontes e CDNs vão direto para a rede, sem cópia.
const CACHE = 'agenda-estudos-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== CACHE) await caches.delete(nome);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const resp = await fetch(req, { cache: 'no-cache' });
      if (resp.ok) {
        const copia = resp.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copia)));
      }
      return resp;
    } catch (err) {
      const guardada = await caches.match(req, { ignoreSearch: true });
      if (guardada) return guardada;
      throw err;
    }
  })());
});
