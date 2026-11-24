import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Roda o sw.js num "self" falso e devolve os ouvintes e o que foi mostrado.
function carregar(fetch, janelas = []) {
  const ouvintes = {};
  const mostradas = [];
  const self = {
    addEventListener: (tipo, f) => { ouvintes[tipo] = f; },
    registration: { scope: 'https://app.teste/agenda/', showNotification: async (t, o) => { mostradas.push({ t, o }); } },
    clients: { matchAll: async () => janelas, openWindow: async () => {}, claim: async () => {} },
    location: { origin: 'https://app.teste' },
    skipWaiting: () => {},
  };
  vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), { self, fetch, caches: {}, URL, Promise, console });
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
