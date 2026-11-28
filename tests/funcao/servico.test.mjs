import test from 'node:test';
import assert from 'node:assert/strict';
import { criarServico, assinarToken } from '../../supabase/functions/lembretes/servico.js';

const SEG = '2026-11-23';
const em = (hhmm, dia = SEG) => Date.parse(`${dia}T${hhmm}:00-03:00`);
const ENV = { LEMBRETES_SEGREDO: 'segredo-de-teste', SUPABASE_URL: 'https://proj.supabase.co', VAPID_PUBLIC_KEY: 'PUB', VAPID_PRIVADA_OK: true };
const DONO = 'u1';

// Banco falso com os mesmos filtros que a entrada traduz para o PostgREST: valor = igual; {in}, {lt}.
function bancoFalso(dados) {
  const t = (n) => (dados[n] ||= []);
  const casa = (linha, filtros = {}) => Object.entries(filtros).every(([k, v]) => {
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(linha[k]);
    if (v && typeof v === 'object' && 'lt' in v) return linha[k] < v.lt;
    if (v && typeof v === 'object' && 'gte' in v) return linha[k] >= v.gte && (!('lte' in v) || linha[k] <= v.lte);
    return linha[k] === v;
  });
  const escritas = [];
  return {
    dados, escritas,
    async select(n, f) { return t(n).filter((l) => casa(l, f)).map((l) => ({ ...l })); },
    async insert(n, linha, { ignorarConflito } = {}) {
      if (n === 'notificacoes_enviadas' && t(n).some((l) => l.owner_id === linha.owner_id && l.chave === linha.chave)) {
        if (ignorarConflito) return [];
        throw new Error('duplicate key');
      }
      const nova = { id: `${n}-${t(n).length + 1}`, ...linha };
      t(n).push(nova); escritas.push(['insert', n, nova]); return [nova];
    },
    async update(n, f, campos) { const ls = t(n).filter((l) => casa(l, f)); ls.forEach((l) => Object.assign(l, campos)); escritas.push(['update', n, f, campos]); return ls; },
    async salvar(n, linha) {
      const atual = t(n).find((l) => l.id === linha.id);
      if (atual) Object.assign(atual, linha); else t(n).push({ ...linha });
      escritas.push(['salvar', n, linha]); return [linha];
    },
    async remove(n, f) { const antes = t(n).length; dados[n] = t(n).filter((l) => !casa(l, f)); escritas.push(['remove', n, f]); return antes - dados[n].length; },
    async usuarioDoJwt(jwt) { return jwt === 'jwt-bom' ? { id: DONO } : null; },
  };
}

const base = () => ({
  push_subscriptions: [{ id: 's1', owner_id: DONO, endpoint: 'https://push/a', p256dh: 'k', auth: 'a' }, { id: 's2', owner_id: DONO, endpoint: 'https://push/b', p256dh: 'k', auth: 'a' }],
  settings: [], commitments: [], items: [], cards: [], adiamentos: [], notificacoes_enviadas: [],
  blocks: [{ id: 'b1', owner_id: DONO, date: SEG, start_min: 1290, end_min: 1380, title: 'Vocabulário', status: 'planned', kind: 'commitment', lembrete_min: null }],
});

function montar({ dados = base(), instante = em('21:20'), status = {} } = {}) {
  const banco = bancoFalso(dados);
  const enviados = [];
  const enviar = async (sub, payload) => { enviados.push({ endpoint: sub.endpoint, payload }); return { status: status[sub.endpoint] ?? 201 }; };
  const relogio = { agora: instante };
  const servico = criarServico({ banco, enviar, agora: () => relogio.agora, env: ENV });
  return { banco, enviados, servico, relogio };
}

const tique = (s, segredo = ENV.LEMBRETES_SEGREDO) => s.tratar(new Request('https://proj.supabase.co/functions/v1/lembretes', { method: 'POST', headers: { 'x-lembretes-segredo': segredo } }));

test('tique envia o lembrete das 21:20 aos dois aparelhos, uma vez só em duas chamadas', async () => {
  const { servico, enviados } = montar();
  assert.equal((await tique(servico)).status, 200);
  assert.equal((await tique(servico)).status, 200);
  assert.deepEqual(enviados.map((e) => e.endpoint), ['https://push/a', 'https://push/b']);
  const p = enviados[0].payload;
  assert.deepEqual([p.titulo, p.corpo, p.tag, p.url], ['Vocabulário', 'Começa às 21:30 (em 10 min)', 'antes:b1:2026-11-23:1290', './?bloco=b1&data=2026-11-23']);
  assert.deepEqual(p.acoes.map((a) => [a.acao, a.titulo]), [['cumprir', 'Cumprido'], ['adiar', 'Adiar 10 min']]);
  assert.match(p.acoes[0].url, /^https:\/\/proj\.supabase\.co\/functions\/v1\/lembretes\?acao=cumprir&t=/);
});

test('inscrição recusada com 410 é apagada e a outra continua recebendo', async () => {
  const { servico, banco, enviados } = montar({ status: { 'https://push/a': 410 } });
  await tique(servico);
  assert.deepEqual(banco.dados.push_subscriptions.map((s) => s.id), ['s2']);
  assert.equal(enviados.length, 2);
});

test('segredo errado no tique → 401 e nada é enviado', async () => {
  const { servico, enviados } = montar();
  assert.equal((await tique(servico, 'errado')).status, 401);
  assert.equal(enviados.length, 0);
});

test('sem linha de settings valem os padrões; dono sem aparelho não é consultado', async () => {
  const dados = base();
  dados.blocks.push({ id: 'b9', owner_id: 'u2', date: SEG, start_min: 1290, end_min: 1300, title: 'Outro', status: 'planned' });
  const { servico, enviados } = montar({ dados });
  await tique(servico);
  assert.ok(enviados.every((e) => e.payload.titulo === 'Vocabulário'));
});

const acao = (s, acaoNome, token) => s.tratar(new Request(`https://proj.supabase.co/functions/v1/lembretes?acao=${acaoNome}&t=${encodeURIComponent(token)}`));

test('token alterado ou vencido → 403 sem escrever nada', async () => {
  const { servico, banco } = montar();
  const bom = await assinarToken(ENV.LEMBRETES_SEGREDO, { dono: DONO, ref: 'b1', data: SEG, acao: 'cumprir', expira: Math.floor(em('21:20') / 1000) + 3600 });
  const alterado = bom.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  assert.equal((await acao(servico, 'cumprir', alterado)).status, 403);
  const vencido = await assinarToken(ENV.LEMBRETES_SEGREDO, { dono: DONO, ref: 'b1', data: SEG, acao: 'cumprir', expira: Math.floor(em('21:20') / 1000) - 1 });
  assert.equal((await acao(servico, 'cumprir', vencido)).status, 403);
  const outraAcao = await assinarToken(ENV.LEMBRETES_SEGREDO, { dono: DONO, ref: 'b1', data: SEG, acao: 'adiar', expira: Math.floor(em('21:20') / 1000) + 3600 });
  assert.equal((await acao(servico, 'cumprir', outraAcao)).status, 403);
  assert.deepEqual(banco.escritas, []);
});

const token = (acaoNome, ref = 'b1', data = SEG) => assinarToken(ENV.LEMBRETES_SEGREDO, { dono: DONO, ref, data, acao: acaoNome, expira: Math.floor(em('21:20') / 1000) + 3600 });

test('cumprir bloco gravado marca done e não mexe no item do card', async () => {
  const dados = base();
  Object.assign(dados.blocks[0], { item_id: 'i1', card_id: 'c1', kind: 'study' });
  dados.items.push({ id: 'i1', owner_id: DONO, card_id: 'c1', done: false });
  const { servico, banco } = montar({ dados });
  assert.equal((await acao(servico, 'cumprir', await token('cumprir'))).status, 200);
  assert.equal(banco.dados.blocks[0].status, 'done');
  assert.equal(banco.dados.items[0].done, false);
});

test('cumprir ocorrência virtual cria o bloco done com os dados da fixa', async () => {
  const dados = base();
  dados.blocks = [];
  dados.commitments.push({ id: 'f1', owner_id: DONO, title: 'Leitura', days: [1], start_min: 1290, end_min: 1350, valid_from: '2026-11-01', valid_to: null, category_id: 'k', card_id: null, lembrete_min: 15 });
  const { servico, banco } = montar({ dados });
  assert.equal((await acao(servico, 'cumprir', await token('cumprir', 'v:f1'))).status, 200);
  const [b] = banco.dados.blocks;
  assert.deepEqual([b.commitment_id, b.date, b.status, b.title, b.start_min, b.category_id, b.lembrete_min, b.kind, b.owner_id],
    ['f1', SEG, 'done', 'Leitura', 1290, 'k', 15, 'commitment', DONO]);
});

test('cumprir bloco que não está planejado não muda nada', async () => {
  const dados = base();
  dados.blocks[0].status = 'missed';
  const { servico, banco } = montar({ dados });
  assert.equal((await acao(servico, 'cumprir', await token('cumprir'))).status, 200);
  assert.equal(banco.dados.blocks[0].status, 'missed');
  assert.deepEqual(banco.escritas, []);
});

test('adiar cria adiamento para daqui a 10 min', async () => {
  const { servico, banco } = montar();
  assert.equal((await acao(servico, 'adiar', await token('adiar'))).status, 200);
  const [a] = banco.dados.adiamentos;
  assert.deepEqual([a.owner_id, a.ref, a.data, a.quando], [DONO, 'b1', SEG, new Date(em('21:30')).toISOString()]);
});

test('adiado sai no tique 10 min depois', async () => {
  const { servico, enviados, relogio } = montar({ instante: em('21:20') });
  await tique(servico);
  await acao(servico, 'adiar', await token('adiar'));
  relogio.agora = em('21:30');
  await tique(servico);
  assert.ok(enviados.some((e) => e.payload.corpo === 'Começa às 21:30 (lembrete adiado)'));
});

const teste = (s, jwt, endpoint, origem = 'https://matheusbellei.github.io') => s.tratar(new Request('https://proj.supabase.co/functions/v1/lembretes?teste=1', {
  method: 'POST', headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), 'Content-Type': 'application/json', Origin: origem }, body: JSON.stringify({ endpoint }),
}));

test('teste: sem JWT válido 401; com JWT envia só para o aparelho pedido, com CORS da origem do app', async () => {
  const { servico, enviados } = montar();
  assert.equal((await teste(servico, null, 'https://push/a')).status, 401);
  assert.equal((await teste(servico, 'jwt-ruim', 'https://push/a')).status, 401);
  const r = await teste(servico, 'jwt-bom', 'https://push/b');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://matheusbellei.github.io');
  assert.deepEqual(enviados.map((e) => [e.endpoint, e.payload.titulo]), [['https://push/b', 'Teste']]);
});

test('teste guarda a resposta do serviço de push no aparelho (o diagnóstico mostra)', async () => {
  const { servico, banco } = montar({ status: { 'https://push/b': 403 } });
  const r = await teste(servico, 'jwt-bom', 'https://push/b');
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { status: 403 });
  assert.equal(banco.dados.push_subscriptions[1].ultimo_status, 403);
});

test('CORS: OPTIONS 204 para a origem do app e localhost; origem estranha não é liberada', async () => {
  const { servico } = montar();
  const pre = (o) => servico.tratar(new Request('https://proj.supabase.co/functions/v1/lembretes?teste=1', { method: 'OPTIONS', headers: { Origin: o } }));
  assert.equal((await pre('https://matheusbellei.github.io')).status, 204);
  assert.equal((await pre('http://localhost:8080')).headers.get('access-control-allow-origin'), 'http://localhost:8080');
  assert.equal((await pre('https://malicioso.exemplo')).headers.get('access-control-allow-origin'), null);
});

test('tique apaga enviadas com mais de 14 dias', async () => {
  const dados = base();
  dados.notificacoes_enviadas.push({ owner_id: DONO, chave: 'velha', enviada_em: new Date(em('21:20') - 15 * 86400000).toISOString() });
  const { servico, banco } = montar({ dados });
  await tique(servico);
  assert.ok(!banco.dados.notificacoes_enviadas.some((n) => n.chave === 'velha'));
});

// ---- Revisão da semana
const DOM = '2026-11-22';
const comEstudo = () => {
  const d = base();
  d.blocks = [
    { id: 'r1', owner_id: DONO, date: '2026-11-17', start_min: 480, end_min: 1050, title: 'Leitura', status: 'done', kind: 'study', category_id: 'E' },
    { id: 'r2', owner_id: DONO, date: '2026-11-18', start_min: 480, end_min: 750, title: 'Leitura', status: 'planned', kind: 'study', category_id: 'E' },
    { id: 'r3', owner_id: DONO, date: '2026-11-18', start_min: 0, end_min: 600, title: 'Trabalho', status: 'done', kind: 'commitment', category_id: 'W' },
  ];
  d.categories = [{ id: 'E', owner_id: DONO, name: 'Idiomas', conta_estudo: true, parent_id: null }, { id: 'W', owner_id: DONO, name: 'Trabalho', conta_estudo: false, parent_id: null }];
  return d;
};

test('fora do minuto da revisão a função não lê as tags', async () => {
  const { servico, banco } = montar({ dados: comEstudo(), instante: em('19:00', DOM) });
  const lidas = [];
  const sel = banco.select.bind(banco);
  banco.select = async (n, f) => { lidas.push(n); return sel(n, f); };
  await tique(servico);
  assert.ok(!lidas.includes('categories'));
});

// ---- Aviso dos flashcards do dia
const DIA_FLASH = '2026-11-24';
const comFlash = (n) => {
  const d = base(); d.blocks = [];
  d.baralhos = [{ id: 'B', owner_id: DONO, novos_dia: 20, revisoes_dia: 200, fator: 2.5 }];
  d.flashcards = Array.from({ length: n }, (_, i) => ({ id: `f${i}`, owner_id: DONO, baralho_id: i % 2 ? 'B' : null, card_id: i % 2 ? null : 'K', tipo: 'basico', frente: 'x', verso: 'y', criado_em: '2026-11-01T00:00:00Z' }));
  d.flash_lados = [];
  return d;
};

test('às 19:00 avisa quantos flashcards há para hoje (baralhos e cards), uma vez', async () => {
  const { servico, enviados } = montar({ dados: comFlash(3), instante: em('19:00', DIA_FLASH) });
  await tique(servico); await tique(servico);
  const avisos = enviados.filter((e) => e.payload.tag === `flash:${DIA_FLASH}`);
  assert.equal(avisos.length, 2);
  assert.deepEqual([avisos[0].payload.titulo, avisos[0].payload.corpo, avisos[0].payload.url], ['Flashcards', 'Você tem 3 flashcards para hoje.', './?tela=flashcards']);
});

test('sem flashcards para hoje não avisa', async () => {
  const { servico, enviados } = montar({ dados: comFlash(0), instante: em('19:00', DIA_FLASH) });
  await tique(servico);
  assert.equal(enviados.length, 0);
});

test('fora do minuto do aviso a função não lê os flashcards', async () => {
  const { servico, banco } = montar({ dados: comFlash(3), instante: em('18:00', DIA_FLASH) });
  const lidas = []; const sel = banco.select.bind(banco);
  banco.select = async (n, f) => { lidas.push(n); return sel(n, f); };
  await tique(servico);
  assert.ok(!lidas.includes('flashcards'));
});

// ---- reforços: nova tentativa, registro do agendador e diagnóstico
test('nenhum aparelho aceitou (falha passageira): o próximo minuto tenta de novo', async () => {
  const status = { 'https://push/a': 500, 'https://push/b': 503 };
  const { servico, enviados, relogio } = montar({ status });
  await tique(servico);
  assert.equal(enviados.length, 2);
  // um minuto depois o serviço de push volta: o mesmo lembrete sai (uma vez)
  delete status['https://push/a']; delete status['https://push/b'];
  relogio.agora = em('21:21');
  enviados.length = 0;
  await tique(servico);
  await tique(servico);
  assert.equal(enviados.length, 2);
});

test('um aparelho aceitou: não repete para ninguém', async () => {
  const { servico, enviados, relogio } = montar({ status: { 'https://push/a': 500 } });
  await tique(servico);
  relogio.agora = em('21:21');
  enviados.length = 0;
  await tique(servico);
  assert.equal(enviados.length, 0);
});

test('guarda o status do último envio de cada aparelho', async () => {
  const { servico, banco } = montar({ status: { 'https://push/a': 403 } });
  await tique(servico);
  const [a, b] = banco.dados.push_subscriptions;
  assert.equal(a.ultimo_status, 403);
  assert.equal(b.ultimo_status, 201);
  assert.ok(b.ultimo_ok);
});

test('cada tique fica registrado; um tique que falha guarda o erro', async () => {
  const { servico, banco, relogio } = montar();
  await tique(servico);
  assert.equal(banco.dados.lembretes_status[0].ultimo_tique, new Date(em('21:20')).toISOString());
  assert.equal(banco.dados.lembretes_status[0].ultimo_erro, null);
  const select = banco.select;
  banco.select = async (n, f) => { if (n === 'commitments') throw new Error('GET commitments: 403 permission denied'); return select(n, f); };
  relogio.agora = em('21:21');
  assert.equal((await tique(servico)).status, 500);
  const st = banco.dados.lembretes_status[0];
  assert.equal(st.ultimo_erro, 'GET commitments: 403 permission denied');
  assert.equal(st.erro_em, new Date(em('21:21')).toISOString());
  assert.equal(st.ultimo_tique, new Date(em('21:20')).toISOString());
});

const diagnostico = (s, jwt, corpo) => s.tratar(new Request('https://proj.supabase.co/functions/v1/lembretes?diagnostico=1', {
  method: 'POST', headers: { Authorization: `Bearer ${jwt}`, Origin: 'https://matheusbellei.github.io' }, body: JSON.stringify(corpo),
}));

test('diagnóstico: confere chaves, banco, agendador e este aparelho', async () => {
  const { servico, banco } = montar();
  banco.dados.lembretes_status = [{ id: 1, ultimo_tique: new Date(em('21:19')).toISOString(), ultimo_erro: null }];
  banco.dados.push_subscriptions[0].ultimo_status = 201;
  const r = await diagnostico(servico, 'jwt-bom', { endpoint: 'https://push/a', vapidPublica: 'PUB' });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(d.chaves, { publica: true, publicaIgual: true, privada: true, segredo: true });
  assert.equal(d.banco, 'ok');
  assert.equal(d.agendador.segundosDesdeUltimo, 60);
  assert.deepEqual([d.aparelho.ativado, d.aparelho.ultimoStatus], [true, 201]);
  const outro = await (await diagnostico(servico, 'jwt-bom', { endpoint: 'https://push/zzz', vapidPublica: 'OUTRA' })).json();
  assert.equal(outro.chaves.publicaIgual, false);
  assert.equal(outro.aparelho.ativado, false);
  assert.equal((await diagnostico(servico, 'jwt-ruim', {})).status, 401);
});

// ---- Troca de inscrição em segundo plano (o navegador renovou o endereço com o app fechado)
const trocar = (s, corpo) => s.tratar(new Request('https://proj.supabase.co/functions/v1/lembretes?trocar=1', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
}));
const NOVO = { endpoint: 'https://push/novo', p256dh: 'k2', auth: 'a2' };

test('troca: o endereço antigo vira o novo, sem login, e o aparelho continua o mesmo', async () => {
  const { servico, banco } = montar();
  const r = await trocar(servico, { antigo: 'https://push/a', novo: NOVO });
  assert.equal(r.status, 200);
  const linha = banco.dados.push_subscriptions.find((l) => l.id === 's1');
  assert.deepEqual([linha.endpoint, linha.p256dh, linha.auth, linha.owner_id], ['https://push/novo', 'k2', 'a2', DONO]);
  assert.equal(banco.dados.push_subscriptions.length, 2);
});

test('troca: se o endereço novo já existe, só apaga o antigo', async () => {
  const dados = base();
  dados.push_subscriptions.push({ id: 's3', owner_id: DONO, endpoint: 'https://push/novo', p256dh: 'k2', auth: 'a2' });
  const { servico, banco } = montar({ dados });
  assert.equal((await trocar(servico, { antigo: 'https://push/a', novo: NOVO })).status, 200);
  assert.deepEqual(banco.dados.push_subscriptions.map((l) => l.id).sort(), ['s2', 's3']);
});

test('troca: endereço antigo que não existe responde 404 e não grava nada', async () => {
  const { servico, banco } = montar();
  assert.equal((await trocar(servico, { antigo: 'https://push/zzz', novo: NOVO })).status, 404);
  assert.equal(banco.escritas.length, 0);
});

test('troca: corpo inválido (sem https, campos vazios) responde 400', async () => {
  const { servico, banco } = montar();
  for (const corpo of [{}, { antigo: 'https://push/a', novo: { ...NOVO, endpoint: 'http://push/novo' } }, { antigo: 'https://push/a', novo: { endpoint: 'https://push/novo' } }, { antigo: 'x', novo: NOVO }]) {
    assert.equal((await trocar(servico, corpo)).status, 400);
  }
  assert.equal(banco.escritas.length, 0);
});
