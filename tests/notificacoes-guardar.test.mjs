import test from 'node:test';
import assert from 'node:assert/strict';

const mapa = new Map();
globalThis.Response = class { constructor(t) { this.t = t; } async text() { return this.t; } };
globalThis.caches = {
  open: async (nome) => ({
    put: async (k, r) => { mapa.set(`${nome}:${k}`, await r.text()); },
    delete: async (k) => mapa.delete(`${nome}:${k}`),
  }),
};
const { guardarParaOSW, esquecerParaOSW } = await import('../js/notificacoes.js');
const store = { urlDaFuncao: (n) => `https://proj.supabase.co/functions/v1/${n}`, vapidPublica: () => 'PUB' };

test('guarda função, chave e endereço no cache do service worker e esquece ao desativar', async () => {
  await guardarParaOSW(store, 'https://push/a');
  assert.deepEqual(JSON.parse(mapa.get('agenda-inscricao:dados')), { funcao: 'https://proj.supabase.co/functions/v1/lembretes', vapid: 'PUB', endpoint: 'https://push/a' });
  await esquecerParaOSW();
  assert.equal(mapa.has('agenda-inscricao:dados'), false);
});

test('sem cache disponível (navegador antigo), não quebra', async () => {
  const antes = globalThis.caches; delete globalThis.caches;
  await guardarParaOSW(store, 'https://push/a'); await esquecerParaOSW();
  globalThis.caches = antes;
});
