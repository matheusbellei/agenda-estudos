import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proximoItem, progresso, ocorrenciasDaSemana, estadoDaOcorrencia,
  paraEncaixar, pendenciasDaVirada, efeitosDeEstado, levadasVencidas,
} from '../../js/regras/fila.js';

const HOJE = '2026-11-18';
const item = (id, card_id, position, done = false, group_name = '') =>
  ({ id, card_id, position, done, group_name, title: id });
const card = (id, extra = {}) => ({
  id, title: id, list_id: 'ativa', archived: false, is_fixed: false, fixed_days: [], ...extra,
});
const bloco = (extra) => ({
  kind: 'study', status: 'planned', date: '2026-11-19', start_min: 480, end_min: 540,
  card_id: null, item_id: null, fixed_date: null, ...extra,
});

function base(extra = {}) {
  return {
    lists: [
      { id: 'ativa', name: 'Em andamento', is_active: true, is_done: false },
      { id: 'backlog', name: 'Backlog', is_active: false, is_done: false },
    ],
    cards: [
      card('F1', { list_id: null, is_fixed: true, fixed_days: [1] }),
      card('F2', { list_id: null, is_fixed: true, fixed_days: [] }),
      card('T'),
      card('A'),
      card('B', { list_id: 'backlog' }),
    ],
    items: [
      item('f2a', 'F2', 1, true), item('f2b', 'F2', 2), item('f2c', 'F2', 3),
      item('i1', 'T', 1, true), item('i2', 'T', 2), item('i3', 'T', 3),
    ],
    blocks: [],
    occurrences: [],
    hoje: HOJE,
    ...extra,
  };
}
const ids = (r) => r.map((e) => `${e.card_id}${e.item_id ? ':' + e.item_id : ''}${e.fixed_date ? '@' + e.fixed_date : ''}`);

test('paraEncaixar devolve fixa com dia, fixa sem dia, trilha e avulso, nesta ordem', () => {
  const r = paraEncaixar(base());
  assert.deepEqual(ids(r), ['F1@2026-11-16', 'F2:f2b', 'T:i2', 'A']);
  assert.deepEqual(r.map((e) => e.tipo), ['fixa', 'fixa', 'trilha', 'avulso']);
  assert.ok(r.every((e) => e.reagendar === false));
});

test('bloco planned de hoje em diante tira a trilha da fila', () => {
  const r = paraEncaixar(base({ blocks: [bloco({ date: '2026-11-19', card_id: 'T', item_id: 'i2' })] }));
  assert.ok(!ids(r).includes('T:i2'));
});

test('bloco missed mantém a trilha na fila com reagendar', () => {
  const r = paraEncaixar(base({ blocks: [bloco({ date: '2026-11-17', status: 'missed', card_id: 'T', item_id: 'i2' })] }));
  const t = r.find((e) => e.card_id === 'T');
  assert.equal(t.item_id, 'i2');
  assert.equal(t.reagendar, true);
});

test('bloco done para a ocorrência tira a fixa da fila e a ocorrência fica cumprida', () => {
  const blocks = [bloco({ date: '2026-11-16', status: 'done', card_id: 'F1', fixed_date: '2026-11-16' })];
  assert.ok(!ids(paraEncaixar(base({ blocks }))).includes('F1@2026-11-16'));
  assert.equal(estadoDaOcorrencia({ card_id: 'F1', date: '2026-11-16' }, [], blocks), 'cumprida');
});

test('occurrences missed tira a fixa da fila e o estado é nao_feita', () => {
  const occurrences = [{ card_id: 'F1', date: '2026-11-16', status: 'missed' }];
  assert.ok(!ids(paraEncaixar(base({ occurrences }))).includes('F1@2026-11-16'));
  assert.equal(estadoDaOcorrencia({ card_id: 'F1', date: '2026-11-16' }, occurrences, []), 'nao_feita');
});

test('ocorrência levada de semana anterior volta à fila além da de 16/11', () => {
  const occurrences = [{ card_id: 'F1', date: '2026-11-09', status: 'carried' }];
  const r = paraEncaixar(base({ occurrences }));
  assert.deepEqual(ids(r).filter((x) => x.startsWith('F1')), ['F1@2026-11-16', 'F1@2026-11-09']);
  assert.equal(estadoDaOcorrencia({ card_id: 'F1', date: '2026-11-09' }, occurrences, []), 'levada');
});

test('ocorrência levada com bloco planned ou done do mesmo fixed_date sai da fila', () => {
  const occurrences = [{ card_id: 'F1', date: '2026-11-09', status: 'carried' }];
  for (const status of ['planned', 'done']) {
    const blocks = [bloco({ status, card_id: 'F1', fixed_date: '2026-11-09' })];
    assert.ok(!ids(paraEncaixar(base({ occurrences, blocks }))).includes('F1@2026-11-09'));
  }
});

test('fixa arquivada não gera ocorrência', () => {
  const cards = [card('F1', { list_id: null, is_fixed: true, fixed_days: [1], archived: true })];
  assert.deepEqual(ocorrenciasDaSemana(cards, '2026-11-16'), []);
});

test('fixa com os sete dias gera 7 ocorrências na semana', () => {
  const cards = [card('D', { list_id: null, is_fixed: true, fixed_days: [1, 2, 3, 4, 5, 6, 7] })];
  const r = ocorrenciasDaSemana(cards, '2026-11-16');
  assert.equal(r.length, 7);
  assert.equal(r[0].date, '2026-11-16');
  assert.equal(r[6].date, '2026-11-22');
});

test('estadoDaOcorrencia: agendada, bloco missed não decide, a_fazer', () => {
  const oc = { card_id: 'F1', date: '2026-11-16' };
  const b = (status) => [bloco({ status, card_id: 'F1', fixed_date: '2026-11-16' })];
  assert.equal(estadoDaOcorrencia(oc, [], b('planned')), 'agendada');
  assert.equal(estadoDaOcorrencia(oc, [], b('missed')), 'a_fazer');
  assert.equal(estadoDaOcorrencia(oc, [], []), 'a_fazer');
  assert.equal(estadoDaOcorrencia(oc, [{ card_id: 'F1', date: '2026-11-16', status: 'done' }], b('planned')), 'cumprida');
});

test('pendenciasDaVirada com ultimaVirada 09/11 pergunta a de 09/11', () => {
  const r = pendenciasDaVirada({
    cards: base().cards, occurrences: [], blocks: [], hoje: HOJE, ultimaVirada: '2026-11-09',
  });
  assert.deepEqual(r.perguntar, [{ card_id: 'F1', date: '2026-11-09' }]);
  assert.deepEqual(r.fecharSozinho, []);
});

test('pendenciasDaVirada com ultimaVirada antiga separa 4 a perguntar e 7 a fechar sozinho', () => {
  const r = pendenciasDaVirada({
    cards: base().cards, occurrences: [], blocks: [], hoje: HOJE, ultimaVirada: '2026-09-01',
  });
  assert.deepEqual(r.perguntar.map((o) => o.date), ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
  assert.deepEqual(r.fecharSozinho.map((o) => o.date), [
    '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12',
  ]);
});

test('pendenciasDaVirada com ultimaVirada na semana de hoje devolve listas vazias', () => {
  const r = pendenciasDaVirada({
    cards: base().cards, occurrences: [], blocks: [], hoje: HOJE, ultimaVirada: '2026-11-16',
  });
  assert.deepEqual(r, { perguntar: [], fecharSozinho: [] });
});

test('pendenciasDaVirada com ultimaVirada nula olha só a semana anterior e ignora ocorrências decididas', () => {
  const cards = [...base().cards, card('G', { list_id: null, is_fixed: true, fixed_days: [2] })];
  const occurrences = [{ card_id: 'G', date: '2026-11-10', status: 'done' }];
  const blocks = [bloco({ date: '2026-11-08', card_id: 'F1', fixed_date: '2026-11-09' })];
  const r = pendenciasDaVirada({ cards, occurrences, blocks, hoje: HOJE, ultimaVirada: null });
  assert.deepEqual(r.perguntar, [{ card_id: 'F1', date: '2026-11-09' }]);
  assert.deepEqual(r.fecharSozinho, []);
});

test('efeitosDeEstado: done em bloco com item marca o item', () => {
  const b = bloco({ card_id: 'T', item_id: 'i2' });
  const r = efeitosDeEstado(b, 'done', base());
  assert.deepEqual(r.marcarItem, { id: 'i2', done: true });
  assert.equal(r.perguntarConcluirCard, false);
});

test('efeitosDeEstado: voltar de done desmarca o item', () => {
  const b = bloco({ card_id: 'T', item_id: 'i2', status: 'done' });
  assert.deepEqual(efeitosDeEstado(b, 'planned', base()).marcarItem, { id: 'i2', done: false });
  assert.deepEqual(efeitosDeEstado(b, 'missed', base()).marcarItem, { id: 'i2', done: false });
});

test('efeitosDeEstado: done em avulso sem itens pergunta se conclui o card', () => {
  const r = efeitosDeEstado(bloco({ card_id: 'A' }), 'done', base());
  assert.equal(r.perguntarConcluirCard, true);
  assert.equal(r.marcarItem, null);
  assert.equal(efeitosDeEstado(bloco({ card_id: 'F2' }), 'done', base()).perguntarConcluirCard, false);
  assert.equal(efeitosDeEstado(bloco({ card_id: 'F1' }), 'done', base()).perguntarConcluirCard, false);
});

test('efeitosDeEstado: missed em bloco com item que não estava feito não mexe no item', () => {
  const r = efeitosDeEstado(bloco({ card_id: 'T', item_id: 'i2' }), 'missed', base());
  assert.deepEqual(r, { marcarItem: null, perguntarConcluirCard: false });
});

test('proximoItem segue a ordem de aparição dos grupos e depois a position', () => {
  const items = [
    item('s2', 'X', 2, false, 'Semana'), item('s1', 'X', 1, true, 'Semana'),
    item('f1', 'X', 1, false, 'Revisão final'), item('o', 'Y', 1),
  ];
  assert.equal(proximoItem('X', items).id, 's2');
  items[0].done = true;
  assert.equal(proximoItem('X', items).id, 'f1');
  items[2].done = true;
  assert.equal(proximoItem('X', items), null);
  assert.deepEqual(progresso('X', items), { feitos: 3, total: 3 });
  assert.deepEqual(progresso('Z', items), { feitos: 0, total: 0 });
});

test('reagendar só vale se o bloco mais recente do alvo é missed', () => {
  const cards = [card('S', { list_id: null, is_fixed: true, fixed_days: [] })];
  const missed = bloco({ date: '2026-11-16', status: 'missed', card_id: 'S' });
  const done = bloco({ date: '2026-11-17', status: 'done', card_id: 'S' });
  const so = paraEncaixar(base({ cards, items: [], blocks: [missed] }));
  assert.equal(so[0].reagendar, true);
  const depois = paraEncaixar(base({ cards, items: [], blocks: [done, missed] }));
  assert.equal(depois.length, 1);
  assert.equal(depois[0].reagendar, false);
  const mesmoDia = paraEncaixar(base({ cards, items: [], blocks: [
    bloco({ date: '2026-11-17', start_min: 600, status: 'missed', card_id: 'S' }),
    bloco({ date: '2026-11-17', start_min: 480, status: 'done', card_id: 'S' }),
  ] }));
  assert.equal(mesmoDia[0].reagendar, true);
});

test('levada: bloco planned no passado não esconde; planned de hoje em diante e done escondem', () => {
  const occurrences = [{ card_id: 'F1', date: '2026-11-09', status: 'carried' }];
  const com = (b) => ids(paraEncaixar(base({ occurrences, blocks: [b] })));
  assert.ok(com(bloco({ date: '2026-11-10', card_id: 'F1', fixed_date: '2026-11-09' })).includes('F1@2026-11-09'));
  assert.ok(!com(bloco({ date: '2026-11-18', card_id: 'F1', fixed_date: '2026-11-09' })).includes('F1@2026-11-09'));
  assert.ok(!com(bloco({ date: '2026-11-10', status: 'done', card_id: 'F1', fixed_date: '2026-11-09' })).includes('F1@2026-11-09'));
});

test('fixa criada em 18/11 não tem ocorrência antes dessa data', () => {
  const cards = [card('N', { list_id: null, is_fixed: true, fixed_days: [1], created_at: '2026-11-18T12:00:00Z' })];
  assert.deepEqual(ocorrenciasDaSemana(cards, '2026-11-16'), []);
  assert.deepEqual(ocorrenciasDaSemana(cards, '2026-11-23'), [{ card_id: 'N', date: '2026-11-23' }]);
  assert.deepEqual(paraEncaixar(base({ cards, items: [] })), []);
});

test('fixa sem dia some da fila quando todos os itens estão feitos', () => {
  const items = base().items.map((i) => (i.card_id === 'F2' ? { ...i, done: true } : i));
  assert.ok(!paraEncaixar(base({ items })).some((e) => e.card_id === 'F2'));
});

test('trilha sem próximo item não é oferecida', () => {
  const items = base().items.map((i) => (i.card_id === 'T' ? { ...i, done: true } : i));
  assert.ok(!paraEncaixar(base({ items })).some((e) => e.card_id === 'T'));
});

test('cards arquivados e fixos não entram como trilha nem avulso', () => {
  const cards = [
    card('T', { archived: true }), card('A', { archived: true }),
    card('X', { is_fixed: true, fixed_days: [] }),
  ];
  const r = paraEncaixar(base({ cards, items: [item('t1', 'T', 1)] }));
  assert.deepEqual(r.filter((e) => e.tipo === 'trilha' || e.tipo === 'avulso'), []);
});

test('pendenciasDaVirada não pergunta ocorrência levada', () => {
  const occurrences = [{ card_id: 'F1', date: '2026-11-09', status: 'carried' }];
  const r = pendenciasDaVirada({ cards: base().cards, occurrences, blocks: [], hoje: HOJE, ultimaVirada: '2026-11-09' });
  assert.deepEqual(r, { perguntar: [], fecharSozinho: [] });
});

// ---- levadasVencidas
const levada = (date, card_id = 'f') => ({ card_id, date, status: 'carried' });
const feito = (date, card_id = 'f') => ({ kind: 'study', card_id, fixed_date: date, status: 'done' });

test('levadasVencidas devolve a levada de 5 semanas e não a de 2', () => {
  const r = levadasVencidas({ occurrences: [levada('2026-10-12'), levada('2026-11-02')], blocks: [], hoje: HOJE });
  assert.deepEqual(r, [{ card_id: 'f', date: '2026-10-12' }]);
});

test('levadasVencidas: 4 semanas exatas ainda não vencem; um dia antes vence', () => {
  const r = levadasVencidas({ occurrences: [levada('2026-10-19'), levada('2026-10-18')], blocks: [], hoje: HOJE });
  assert.deepEqual(r.map((x) => x.date), ['2026-10-18']);
});

test('levadasVencidas ignora a que tem bloco cumprido e as que não estão levadas', () => {
  const r = levadasVencidas({
    occurrences: [levada('2026-10-12'), { card_id: 'f', date: '2026-10-05', status: 'missed' }, { card_id: 'f', date: '2026-09-28', status: 'done' }],
    blocks: [feito('2026-10-12')], hoje: HOJE,
  });
  assert.deepEqual(r, []);
});

test('levadasVencidas: bloco cumprido de outra fixa ou de outra data não conta', () => {
  const r = levadasVencidas({ occurrences: [levada('2026-10-12')], blocks: [feito('2026-10-12', 'g'), feito('2026-10-05')], hoje: HOJE });
  assert.equal(r.length, 1);
});
