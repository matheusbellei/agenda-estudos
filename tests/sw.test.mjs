import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Roda o sw.js num "self" falso e devolve os ouvintes e o que foi mostrado.
function carregar(fetch, janelas = [], { caches = {}, pushManager } = {}) {
  const ouvintes = {};
  const mostradas = [];
  const self = {
    addEventListener: (tipo, f) => { ouvintes[tipo] = f; },
    registration: { scope: 'https://app.teste/agenda/', pushManager, showNotification: async (t, o) => { mostradas.push({ t, o }); } },
    clients: { matchAll: async () => janelas, openWindow: async () => {}, claim: async () => {} },
    location: { origin: 'https://app.teste' },
    skipWaiting: () => {},
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, fetch, caches, URL, Promise, console, atob, Uint8Array, JSON, String, Response: class { constructor(t) { this.t = t; } async text() { return this.t; } } });
  return { ouvintes, mostradas };
}

async function clicar(ouvintes, acao) {
  let espera;
  ouvintes.notificationclick({
    action: acao,
    notification: { close() {}, data: { url: './', acoes: [{ acao: 'cumprir', titulo: 'Cumprido', url: 'https://f/l?acao=cumprir' }] } },
    waitUntil: (p) => { espera = p; },
  });
  await espera;
}

test('Cumprido que dá certo não mostra nada a mais', async () => {
  const { ouvintes, mostradas } = carregar(async () => ({ ok: true, status: 200 }));
  await clicar(ouvintes, 'cumprir');
  assert.equal(mostradas.length, 0);
});

test('Cumprido sem rede ou com link vencido avisa para abrir o app', async () => {
  for (const fetch of [async () => { throw new Error('offline'); }, async () => ({ ok: false, status: 403 })]) {
    const { ouvintes, mostradas } = carregar(fetch);
    await clicar(ouvintes, 'cumprir');
    assert.equal(mostradas.length, 1);
    assert.equal(mostradas[0].t, 'Não deu para marcar');
    assert.match(mostradas[0].o.body, /Abra o app/);
  }
});

async function receber(ouvintes, dados) {
  let espera;
  ouvintes.push({ data: { json: () => dados, text: () => '' }, waitUntil: (p) => { espera = p; } });
  await espera;
}
const janela = (visibilityState) => {
  const recebidas = [];
  return { url: 'https://app.teste/agenda/index.html', visibilityState, postMessage: (m) => recebidas.push(m), recebidas };
};

test('fim de fase do foco com o app visível: não mostra o push e avisa a janela', async () => {
  const j = janela('visible');
  const { ouvintes, mostradas } = carregar(async () => ({ ok: true }), [j]);
  await receber(ouvintes, { titulo: 'Modo foco', corpo: 'x', tag: 'foco:u1:2026', url: './?tela=foco' });
  assert.equal(mostradas.length, 0);
  assert.equal(JSON.stringify(j.recebidas), JSON.stringify([{ tipo: 'foco-fim' }])); // objeto de outro contexto (vm)
});

test('fim de fase do foco com o app escondido: mostra', async () => {
  const { ouvintes, mostradas } = carregar(async () => ({ ok: true }), [janela('hidden')]);
  await receber(ouvintes, { titulo: 'Modo foco', corpo: 'x', tag: 'foco:u1:2026' });
  assert.equal(mostradas.length, 1);
});

test('lembrete comum com o app visível continua aparecendo', async () => {
  const { ouvintes, mostradas } = carregar(async () => ({ ok: true }), [janela('visible')]);
  await receber(ouvintes, { titulo: 'Vocabulário', corpo: 'x', tag: 'antes:b1' });
  assert.equal(mostradas.length, 1);
});

test('falha em "Começar pausa" avisa com o texto do foco', async () => {
  const { ouvintes, mostradas } = carregar(async () => ({ ok: false, status: 403 }));
  let espera;
  ouvintes.notificationclick({
    action: 'proxima',
    notification: { close() {}, data: { url: './?tela=foco', acoes: [{ acao: 'proxima', titulo: 'Começar pausa', url: 'https://f/l?acao=proxima' }] } },
    waitUntil: (p) => { espera = p; },
  });
  await espera;
  assert.equal(mostradas[0].t, 'Não deu para começar');
  assert.match(mostradas[0].o.body, /Abra o app no Modo foco/);
});

// ---- pushsubscriptionchange: o navegador renovou a inscrição com o app fechado
function cacheFalso(guardado) {
  const mapa = new Map(guardado ? [['dados', JSON.stringify(guardado)]] : []);
  return {
    mapa,
    open: async () => ({
      match: async (k) => (mapa.has(k) ? { json: async () => JSON.parse(mapa.get(k)) } : undefined),
      put: async (k, r) => { mapa.set(k, await r.text()); },
    }),
  };
}
const DADOS = { funcao: 'https://proj.supabase.co/functions/v1/lembretes', vapid: 'AQID', endpoint: 'https://push/velho' };
const inscricaoNova = { endpoint: 'https://push/novo', toJSON: () => ({ endpoint: 'https://push/novo', keys: { p256dh: 'k2', auth: 'a2' } }) };

async function trocou(ouvintes, evento) {
  let espera;
  ouvintes.pushsubscriptionchange({ ...evento, waitUntil: (p) => { espera = p; } });
  await espera;
}

test('troca de inscrição: reinscreve com a chave guardada e avisa a função com o endereço antigo e o novo', async () => {
  const chamadas = []; const inscreveu = [];
  const caches = cacheFalso(DADOS);
  const { ouvintes } = carregar(async (url, init) => { chamadas.push({ url, corpo: JSON.parse(init.body) }); return { ok: true, status: 200 }; }, [],
    { caches, pushManager: { subscribe: async (o) => { inscreveu.push(o); return inscricaoNova; } } });
  await trocou(ouvintes, { oldSubscription: { endpoint: 'https://push/velho' }, newSubscription: null });
  assert.equal(inscreveu[0].userVisibleOnly, true);
  assert.deepEqual([...inscreveu[0].applicationServerKey], [1, 2, 3]);
  assert.equal(chamadas[0].url, 'https://proj.supabase.co/functions/v1/lembretes?trocar=1');
  assert.deepEqual(chamadas[0].corpo, { antigo: 'https://push/velho', novo: { endpoint: 'https://push/novo', p256dh: 'k2', auth: 'a2' } });
  assert.equal(JSON.parse(caches.mapa.get('dados')).endpoint, 'https://push/novo');
});

test('troca de inscrição: usa a inscrição nova que o navegador já entrega e o endereço guardado se faltar a antiga', async () => {
  const chamadas = []; let inscreveu = 0;
  const { ouvintes } = carregar(async (url, init) => { chamadas.push(JSON.parse(init.body)); return { ok: true, status: 200 }; }, [],
    { caches: cacheFalso(DADOS), pushManager: { subscribe: async () => { inscreveu += 1; return inscricaoNova; } } });
  await trocou(ouvintes, { oldSubscription: null, newSubscription: inscricaoNova });
  assert.equal(inscreveu, 0);
  assert.equal(chamadas[0].antigo, 'https://push/velho');
});

test('troca de inscrição: sem dados guardados ou com a função fora do ar, não quebra nem muda o que foi guardado', async () => {
  const sem = carregar(async () => { throw new Error('x'); }, [], { caches: cacheFalso(null), pushManager: { subscribe: async () => inscricaoNova } });
  await trocou(sem.ouvintes, { oldSubscription: { endpoint: 'https://push/velho' } });
  const caches = cacheFalso(DADOS);
  const fora = carregar(async () => { throw new Error('offline'); }, [], { caches, pushManager: { subscribe: async () => inscricaoNova } });
  await trocou(fora.ouvintes, { oldSubscription: { endpoint: 'https://push/velho' } });
  assert.equal(JSON.parse(caches.mapa.get('dados')).endpoint, 'https://push/velho');
});

test('notificação mostra o logo uma vez só: ícone grande, sem selo repetido', async () => {
  const { ouvintes, mostradas } = carregar(async () => ({ ok: true }));
  await receber(ouvintes, { titulo: 'Vocabulário', corpo: 'Começa às 21:30', tag: 'b1', url: './' });
  assert.equal(mostradas[0].o.icon, 'icones/icone-192.png');
  assert.equal('badge' in mostradas[0].o, false);
});
