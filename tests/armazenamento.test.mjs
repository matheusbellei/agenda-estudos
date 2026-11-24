import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../js/armazenamento.js';
import { fakeClient } from './fake-supabase.mjs';

const ops = (c) => JSON.parse(JSON.stringify(c.ops));
const linhas = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

test('list pagina de 1000 em 1000 ordenando por id', async () => {
  const respostas = [linhas(1000), linhas(3)];
  const client = fakeClient(() => ({ data: respostas.shift(), error: null }));
  const out = await createStore(client).list('cards');
  assert.equal(out.length, 1003);
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['order', 'id'], ['range', 0, 999]]);
  assert.deepEqual(ops(client.calls[1]), [['select', '*'], ['order', 'id'], ['range', 1000, 1999]]);
  assert.equal(client.calls.length, 2);
});

test('list de settings e card_categories ordena pela chave delas', async () => {
  const client = fakeClient({ data: [], error: null });
  const s = createStore(client);
  await s.list('settings');
  await s.list('card_categories');
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['order', 'owner_id'], ['range', 0, 999]]);
  assert.deepEqual(ops(client.calls[1]), [['select', '*'], ['order', 'card_id'], ['order', 'category_id'], ['range', 0, 999]]);
});

test('insert devolve um array com a linha criada', async () => {
  const client = fakeClient({ data: [{ id: 'x', title: 'x' }], error: null });
  const out = await createStore(client).insert('cards', { title: 'x' });
  assert.deepEqual(out, [{ id: 'x', title: 'x' }]);
  assert.deepEqual(ops(client.calls[0]), [['insert', [{ title: 'x' }]], ['select']]);
});

test('upsert ignora duplicados no conflito informado', async () => {
  const client = fakeClient({ data: [{ id: 'a' }], error: null });
  const rows = [{ title: 'a', trello_id: 't1' }];
  await createStore(client).upsert('cards', rows, 'owner_id,trello_id');
  assert.deepEqual(ops(client.calls[0]), [['upsert', rows, { onConflict: 'owner_id,trello_id', ignoreDuplicates: true }], ['select']]);
});

test('update filtra por id; em settings, pelo dono; sem linha afetada avisa', async () => {
  const client = fakeClient({ data: [{ id: 'x' }], error: null });
  const s = createStore(client);
  await s.update('cards', 'x', { title: 'y' });
  await s.update('settings', 'u1', { day_start_min: 1 });
  assert.deepEqual(ops(client.calls[0]), [['update', { title: 'y' }], ['eq', 'id', 'x'], ['select']]);
  assert.deepEqual(ops(client.calls[1]), [['update', { day_start_min: 1 }], ['eq', 'owner_id', 'u1'], ['select']]);
  await assert.rejects(createStore(fakeClient({ data: [], error: null })).update('cards', 'x', {}), /só pode alterar os seus próprios dados/);
});

test('remove e removeWhere', async () => {
  const client = fakeClient({ data: null, error: null });
  const s = createStore(client);
  await s.remove('cards', 'x');
  await s.removeWhere('card_categories', { card_id: 'c', category_id: 'k' });
  assert.deepEqual(ops(client.calls[0]), [['delete'], ['eq', 'id', 'x']]);
  assert.deepEqual(ops(client.calls[1]), [['delete'], ['eq', 'card_id', 'c'], ['eq', 'category_id', 'k']]);
});

test('erros viram mensagens em português', async () => {
  const jwt = fakeClient({ data: null, error: { message: 'JWT expired' } });
  await assert.rejects(createStore(jwt).list('cards'), new Error('Sua sessão expirou. Entre de novo.'));
  const rede = fakeClient(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(createStore(rede).list('cards'), new Error('Sem conexão. Tente de novo.'));
  const senha = fakeClient({}, { signIn: async () => ({ data: null, error: { message: 'Invalid login credentials' } }) });
  await assert.rejects(createStore(senha).signIn('a@b.c', 'x'), new Error('E-mail ou senha incorretos.'));
});

test('sessão: signIn, restoreSession e currentUser', async () => {
  const s = createStore(fakeClient({}, { session: { user: { id: 'u9' } } }));
  assert.equal(s.currentUser(), null);
  assert.equal((await s.restoreSession()).id, 'u9');
  assert.equal(s.currentUser().id, 'u9');
  const s2 = createStore(fakeClient());
  assert.equal((await s2.signIn('a@b.c', 'x')).email, 'a@b.c');
});

test('onAuthChange só avisa a perda de uma sessão que existia', async () => {
  const auth = {};
  const s = createStore(fakeClient({}, auth));
  const avisos = [];
  s.onAuthChange((u) => avisos.push(u));
  auth.cb('INITIAL_SESSION', null);          // evento inicial sem sessão: ignorado
  assert.deepEqual(avisos, []);
  auth.cb('SIGNED_IN', { user: { id: 'u1' } });
  auth.cb('TOKEN_REFRESHED', { user: { id: 'u1' } });
  assert.deepEqual(avisos, []);
  auth.cb('SIGNED_OUT', null);
  assert.deepEqual(avisos, [null]);
  auth.cb('SIGNED_OUT', null);               // já estava fora: não repete
  assert.deepEqual(avisos, [null]);
});

test('arquivos: upload, URL assinada de 3600 s e remoção no bucket anexos', async () => {
  const client = fakeClient();
  const s = createStore(client);
  await s.uploadFile('u/c/1-a.png', 'ARQ');
  assert.equal(await s.signedUrl('u/c/1-a.png'), 'https://x/assinada');
  await s.removeFile('u/c/1-a.png');
  assert.deepEqual(client.storageCalls, [
    ['anexos', 'upload', 'u/c/1-a.png', 'ARQ'],
    ['anexos', 'createSignedUrl', 'u/c/1-a.png', 3600],
    ['anexos', 'remove', ['u/c/1-a.png']],
  ]);
});

test('erro de storage também é traduzido', async () => {
  const client = fakeClient({}, {}, { upload: () => ({ data: null, error: { message: 'new row violates row-level security policy' } }) });
  await assert.rejects(createStore(client).uploadFile('p', 'a'), /só pode alterar os seus próprios dados/);
});

test('violação de unicidade vira mensagem em português', async () => {
  const dup = fakeClient({ data: null, error: { message: 'duplicate key value violates unique constraint "lists_uma_concluida"' } });
  await assert.rejects(createStore(dup).insert('lists', { name: 'x' }), new Error('Já existe um registro igual. Atualize a página e tente de novo.'));
});

test('get lê uma linha atual pelo id (ou pelo dono em settings) e devolve null se não houver', async () => {
  const client = fakeClient({ data: [{ id: 'x', notes: 'n' }], error: null });
  const s = createStore(client);
  assert.deepEqual(await s.get('cards', 'x'), { id: 'x', notes: 'n' });
  await s.get('settings', 'u1');
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['eq', 'id', 'x']]);
  assert.deepEqual(ops(client.calls[1]), [['select', '*'], ['eq', 'owner_id', 'u1']]);
  assert.equal(await createStore(fakeClient({ data: [], error: null })).get('cards', 'y'), null);
});

test('store real: url da função, chave pública e token da sessão (notificações)', async () => {
  const antes = globalThis.window;
  const client = fakeClient({ data: [], error: null });
  client.auth = { ...(client.auth || {}), getSession: async () => ({ data: { session: { access_token: 'tok' } } }) };
  globalThis.window = { supabase: { createClient: () => client } };
  try {
    const { criarStoreReal } = await import('../js/armazenamento.js');
    const s = criarStoreReal('https://proj.supabase.co', 'sb_publishable_x', { vapid: 'BPUB' });
    assert.equal(s.urlDaFuncao('lembretes'), 'https://proj.supabase.co/functions/v1/lembretes');
    assert.equal(s.vapidPublica(), 'BPUB');
    assert.equal(await s.tokenDeAcesso(), 'tok');
    assert.equal(criarStoreReal('https://proj.supabase.co', 'k').vapidPublica(), '');
  } finally {
    globalThis.window = antes;
  }
});

test('list de focos ordena pelo dono (a tabela não tem id)', async () => {
  const client = fakeClient({ data: [], error: null });
  await createStore(client).list('focos');
  assert.deepEqual(ops(client.calls[0]), [['select', '*'], ['order', 'owner_id'], ['range', 0, 999]]);
});

test('updateWhere filtra por todas as colunas e devolve [] sem erro quando nada casa', async () => {
  const client = fakeClient({ data: [], error: null });
  const out = await createStore(client).updateWhere('focos', { owner_id: 'u1', termina_em: '2026-11-24T13:25:00+00:00' }, { estado: 'esperando' });
  assert.deepEqual(out, []);
  assert.deepEqual(ops(client.calls[0]), [['update', { estado: 'esperando' }], ['eq', 'owner_id', 'u1'], ['eq', 'termina_em', '2026-11-24T13:25:00+00:00'], ['select']]);
});

test('removeIds apaga várias linhas numa chamada só', async () => {
  const client = fakeClient({ data: null, error: null });
  await createStore(client).removeIds('blocks', ['a', 'b']);
  assert.deepEqual(ops(client.calls[0]), [['delete'], ['in', 'id', ['a', 'b']]]);
});
