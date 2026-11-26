// Service worker do app instalado.
// Rede primeiro: com internet, sempre a versão mais nova do GitHub Pages; a cópia guardada só abre a casca sem rede.
// Só arquivos do próprio site passam por aqui. Supabase, fontes e CDNs vão direto para a rede, sem cópia.
const CACHE = 'agenda-estudos-v3';
// Guarda, para o service worker, o endereço da função, a chave pública e a inscrição deste aparelho
// (o app grava; sem isso a troca em segundo plano não teria como saber nada com o app fechado).
const CACHE_INSCRICAO = 'agenda-inscricao';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const nome of await caches.keys()) if (nome !== CACHE && nome !== CACHE_INSCRICAO) await caches.delete(nome);
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

// ---- Notificações (enviadas pela função "lembretes" do Supabase, mesmo com o app fechado)
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : '' }; }
  const acoes = Array.isArray(d.acoes) ? d.acoes : [];
  const mostrar = () => self.registration.showNotification(d.titulo || 'Agenda de Estudos', {
    body: d.corpo || '',
    tag: d.tag || undefined,
    icon: 'icones/icone-192.png',
    badge: 'icones/icone-192.png',
    data: { url: d.url || './', acoes },
    actions: acoes.map((a) => ({ action: a.acao, title: a.titulo })),
  });
  // Fim de fase do foco com o app na tela: o próprio app toca e mostra; o push sairia em dobro.
  e.waitUntil((async () => {
    if (String(d.tag || '').startsWith('foco:')) {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const visivel = janelas.find((c) => c.visibilityState === 'visible' && c.url.startsWith(self.registration.scope));
      if (visivel) { visivel.postMessage({ tipo: 'foco-fim' }); return; }
    }
    await mostrar();
  })());
});

self.addEventListener('notificationclick', (e) => {
  const n = e.notification;
  n.close();
  const acao = (n.data?.acoes || []).find((a) => a.acao === e.action);
  // "Cumprido" e "Adiar 10 min" resolvem pela função, sem abrir o app.
  if (acao) {
    // Sem rede ou link vencido (vale 24 h): avisa em vez de falhar calado.
    const doFoco = acao.acao === 'proxima';
    const avisar = () => self.registration.showNotification(doFoco ? 'Não deu para começar' : 'Não deu para marcar', {
      body: doFoco ? `"${acao.titulo}" não foi registrado. Abra o app no Modo foco.` : `"${acao.titulo}" não foi registrado. Abra o app para marcar o bloco.`,
      icon: 'icones/icone-192.png', tag: 'falha-acao',
    });
    e.waitUntil(fetch(acao.url).then((r) => (r.ok ? null : avisar()), avisar));
    return;
  }
  const alvo = new URL(n.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = janelas.find((c) => c.url.startsWith(self.registration.scope));
    if (aberta) { await aberta.focus(); aberta.postMessage({ tipo: 'abrir', url: alvo }); return; }
    await self.clients.openWindow(alvo);
  })());
});

// ---- O navegador renovou a inscrição de push (acontece de vez em quando, com o app fechado):
// reinscreve com a chave guardada e avisa a função, que troca o endereço no banco. Sem isso, os avisos
// parariam até o próximo acesso ao app.
function chaveParaBytes(texto) {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_INSCRICAO);
      const guardado = await cache.match('dados');
      if (!guardado) return;
      const dados = await guardado.json();
      const nova = e.newSubscription
        || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(dados.vapid) });
      const { endpoint, keys } = nova.toJSON();
      const antigo = e.oldSubscription?.endpoint || dados.endpoint;
      const resp = await fetch(`${dados.funcao}?trocar=1`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ antigo, novo: { endpoint, p256dh: keys.p256dh, auth: keys.auth } }),
      });
      // Só guarda o endereço novo se a função aceitou; senão o app refaz tudo ao abrir (sincronizar).
      if (resp.ok) await cache.put('dados', new Response(JSON.stringify({ ...dados, endpoint })));
    } catch { /* sem rede ou sem dados: o app refaz ao abrir */ }
  })());
});
