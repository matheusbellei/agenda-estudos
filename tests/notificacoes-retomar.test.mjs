import test from 'node:test';
import assert from 'node:assert/strict';

const mapa = new Map();
globalThis.Response = class { constructor(t) { this.t = t; } async text() { return this.t; } };
globalThis.caches = { open: async (nome) => ({
  put: async (k, r) => { mapa.set(`${nome}:${k}`, await r.text()); },
  match: async (k) => (mapa.has(`${nome}:${k}`) ? { json: async () => JSON.parse(mapa.get(`${nome}:${k}`)) } : undefined),
  delete: async (k) => mapa.delete(`${nome}:${k}`),
}) };
const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
let inscricaoAtual = null; let permissao = 'granted';
const nova = { endpoint: 'https://push/novo', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'p', auth: 'a' } }; }, options: { applicationServerKey: null } };
const pushManager = { getSubscription: async () => inscricaoAtual, subscribe: async () => { inscricaoAtual = nova; return nova; } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Safari/537.36', serviceWorker: { ready: Promise.resolve({ pushManager }) } } });
globalThis.PushManager = class {};
globalThis.window = globalThis;
globalThis.Notification = { get permission() { return permissao; } };
const { sincronizar } = await import('../js/notificacoes.js');

function criarStore(linhas) {
  return { linhas, urlDaFuncao: () => 'https://f/lembretes', vapidPublica: async () => KEY,
    list: async () => linhas, insert: async (_t, l) => { linhas.push({ id: `n${linhas.length}`, ...l }); },
    remove: async (_t, id) => { const i = linhas.findIndex((l) => l.id === id); if (i >= 0) linhas.splice(i, 1); } };
}

test('o navegador perdeu a inscrição mas a permissão continua: refaz sozinho e troca a linha antiga', async () => {
  inscricaoAtual = null; permissao = 'granted';
  mapa.set('agenda-inscricao:dados', JSON.stringify({ funcao: 'x', vapid: KEY, endpoint: 'https://push/velho' }));
  const st = criarStore([{ id: 'v', endpoint: 'https://push/velho', aparelho: 'Chrome no Android' }]);
  await sincronizar(st);
  assert.deepEqual(st.linhas.map((l) => l.endpoint), ['https://push/novo']);
  assert.equal(JSON.parse(mapa.get('agenda-inscricao:dados')).endpoint, 'https://push/novo');
});

test('quem nunca ativou (sem lembrança no cache) não é inscrito sozinho', async () => {
  inscricaoAtual = null; permissao = 'granted'; mapa.clear();
  const st = criarStore([]);
  await sincronizar(st);
  assert.equal(st.linhas.length, 0);
  assert.equal(inscricaoAtual, null);
});

test('permissão retirada: não inscreve (o botão da tela pede de novo)', async () => {
  inscricaoAtual = null; permissao = 'default';
  mapa.set('agenda-inscricao:dados', JSON.stringify({ funcao: 'x', vapid: KEY, endpoint: 'https://push/velho' }));
  const st = criarStore([{ id: 'v', endpoint: 'https://push/velho' }]);
  await sincronizar(st);
  assert.equal(inscricaoAtual, null);
});
