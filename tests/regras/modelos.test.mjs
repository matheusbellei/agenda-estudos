import test from 'node:test';
import assert from 'node:assert/strict';
import { itensDoModelo, planoDeAplicacao, textoDaContagem } from '../../js/regras/modelos.js';

const SEG = '2026-11-16';
const PROX = '2026-11-23';
let n = 0;
const b = (date, start_min, extra = {}) => ({ id: `b${n += 1}`, date, start_min, end_min: start_min + 60, kind: 'study', title: 'Estudo', status: 'planned',
  cancelled: false, category_id: 'E', card_id: 'K', item_id: 'i1', commitment_id: null, fixed_date: null, revisao_id: null, lembrete_min: null, ...extra });
const fixa = { id: 'F', title: 'Trabalho', days: [1, 2, 3, 4, 5], start_min: 540, end_min: 1080, valid_from: '2026-11-01', valid_to: null, category_id: 'W', card_id: null, lembrete_min: null };
const dados = (blocks, extra = {}) => ({ blocks, commitments: [fixa], cards: [{ id: 'K' }], items: [{ id: 'i1', card_id: 'K' }], categories: [{ id: 'E' }, { id: 'W' }], ...extra });

test('itensDoModelo: blocos da semana sem vínculos de revisão e de fixa de card; fixas só se pedido', () => {
  const blocks = [b('2026-11-16', 480), b('2026-11-18', 1200, { status: 'done', fixed_date: '2026-11-18', revisao_id: 'r1' }), b('2026-11-17', 600, { cancelled: true }),
    b('2026-11-25', 480), b('2026-11-17', 540, { commitment_id: 'F', kind: 'commitment', card_id: null, item_id: null, category_id: 'W', title: 'Trabalho' })];
  const sem = itensDoModelo({ blocks, commitments: [fixa] }, SEG, false);
  assert.deepEqual(sem.map((i) => [i.dia, i.start_min]), [[1, 480], [3, 1200]]);
  assert.deepEqual(sem[1], { dia: 3, start_min: 1200, end_min: 1260, kind: 'study', title: 'Estudo', category_id: 'E', card_id: 'K', item_id: 'i1', lembrete_min: null, commitment_id: null });
  const com = itensDoModelo({ blocks, commitments: [fixa] }, SEG, true);
  assert.equal(com.filter((i) => i.commitment_id === 'F').length, 5);
});

test('planoDeAplicacao: semana seguinte, caixas marcadas', () => {
  const blocks = [b(PROX, 480), b('2026-11-24', 600, { status: 'done' }), b('2026-11-25', 600, { status: 'missed' }), b('2026-11-26', 600, { cancelled: true })];
  const itens = [{ dia: 1, start_min: 420, end_min: 480, kind: 'study', title: 'Gramática', category_id: 'E', card_id: 'K', item_id: 'i1', lembrete_min: 10, commitment_id: null }];
  const p = planoDeAplicacao({ itens, dados: dados(blocks), segunda: PROX, hoje: '2026-11-18', manterCumpridos: true, manterNaoFeitos: true });
  assert.deepEqual(p.remover, [blocks[0].id]);
  assert.deepEqual(p.contagem, { planejados: 1, cumpridos: 0, nao_feitos: 0 });
  assert.deepEqual(p.criar, [{ date: PROX, start_min: 420, end_min: 480, kind: 'study', title: 'Gramática', category_id: 'E', card_id: 'K', item_id: 'i1', lembrete_min: 10, status: 'planned' }]);
  const tudo = planoDeAplicacao({ itens, dados: dados(blocks), segunda: PROX, hoje: '2026-11-18', manterCumpridos: false, manterNaoFeitos: false });
  assert.deepEqual(tudo.contagem, { planejados: 1, cumpridos: 1, nao_feitos: 1 });
  assert.equal(tudo.remover.length, 3);
});

test('planoDeAplicacao: semana atual numa quarta não mexe na segunda e na terça', () => {
  const blocks = [b('2026-11-16', 480), b('2026-11-17', 480), b('2026-11-18', 480), b('2026-11-20', 480)];
  const itens = [1, 2, 3, 5].map((dia) => ({ dia, start_min: 900, end_min: 960, kind: 'study', title: 'X', category_id: null, card_id: null, item_id: null, lembrete_min: null, commitment_id: null }));
  const p = planoDeAplicacao({ itens, dados: dados(blocks), segunda: SEG, hoje: '2026-11-18', manterCumpridos: true, manterNaoFeitos: true });
  assert.deepEqual(p.remover, [blocks[2].id, blocks[3].id]);
  assert.deepEqual(p.criar.map((c) => c.date), ['2026-11-18', '2026-11-20']);
  assert.equal(p.criar[0].kind, 'commitment');
});

test('planoDeAplicacao: fixa válida é pulada, fixa encerrada vira bloco, referências sumidas viram null', () => {
  const itens = [
    { dia: 1, start_min: 540, end_min: 1080, kind: 'commitment', title: 'Trabalho', category_id: 'W', card_id: null, item_id: null, lembrete_min: null, commitment_id: 'F' },
    { dia: 6, start_min: 540, end_min: 600, kind: 'commitment', title: 'Feira', category_id: 'W', card_id: null, item_id: null, lembrete_min: null, commitment_id: 'G' },
    { dia: 2, start_min: 480, end_min: 540, kind: 'study', title: 'Velho', category_id: 'X', card_id: 'SUMIU', item_id: 'i9', lembrete_min: null, commitment_id: null },
  ];
  const p = planoDeAplicacao({ itens, dados: dados([]), segunda: PROX, hoje: '2026-11-18', manterCumpridos: true, manterNaoFeitos: true });
  assert.deepEqual(p.criar.map((c) => [c.date, c.title, c.category_id, c.card_id, c.item_id, c.kind]), [
    ['2026-11-28', 'Feira', 'W', null, null, 'commitment'],
    ['2026-11-24', 'Velho', null, null, null, 'commitment'],
  ]);
});

test('textoDaContagem', () => {
  assert.equal(textoDaContagem({ planejados: 6, cumpridos: 2, nao_feitos: 0 }), 'Saem 6 planejados e 2 cumpridos.');
  assert.equal(textoDaContagem({ planejados: 1, cumpridos: 1, nao_feitos: 1 }), 'Saem 1 planejado, 1 cumprido e 1 não feito.');
  assert.equal(textoDaContagem({ planejados: 0, cumpridos: 0, nao_feitos: 3 }), 'Saem 3 não feitos.');
  assert.equal(textoDaContagem({ planejados: 1, cumpridos: 0, nao_feitos: 0 }), 'Sai 1 planejado.');
  assert.equal(textoDaContagem({ planejados: 0, cumpridos: 0, nao_feitos: 0 }), 'Nenhum bloco sai.');
});
