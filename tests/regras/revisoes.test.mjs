import test from 'node:test';
import assert from 'node:assert/strict';
import { datasDoPadrao, validarDias, validarDatas, revisoesParaEncaixar, statusDaRevisao, textoDasRevisoes } from '../../js/regras/revisoes.js';

const HOJE = '2026-11-24';
const rev = (id, data, extra = {}) => ({ id, card_id: 'K', data, status: 'pendente', ...extra });
const cards = [{ id: 'K', title: 'Curso', archived: false }, { id: 'Z', title: 'Arquivado', archived: true }];
const bloco = (extra) => ({ id: Math.random().toString(36).slice(2), kind: 'study', status: 'planned', date: HOJE, start_min: 480, end_min: 540, cancelled: false, ...extra });

test('datasDoPadrao', () => {
  assert.deepEqual(datasDoPadrao(HOJE, [7, 30]), ['2026-12-01', '2026-12-24']);
});

test('validarDias', () => {
  assert.deepEqual(validarDias('7, 30'), { dias: [7, 30] });
  assert.deepEqual(validarDias(' 3,10 , 30 '), { dias: [3, 10, 30] });
  for (const t of ['', '30, 7', '0', '7,7', '1,2,3,4,5,6,7', '400', 'sete']) {
    assert.ok(validarDias(t).erro, t);
  }
  assert.equal(validarDias('30, 7').erro, 'Use de 1 a 6 números de 1 a 365, do menor para o maior, sem repetir (ex.: 7, 30).');
});

test('validarDatas', () => {
  assert.equal(validarDatas(['2026-12-01', '2026-12-24'], HOJE), null);
  assert.equal(validarDatas([HOJE], HOJE), null);
  assert.equal(validarDatas([], HOJE), 'Escolha pelo menos uma data.');
  assert.equal(validarDatas(['2026-11-23'], HOJE), 'As datas precisam ser de hoje em diante.');
  assert.equal(validarDatas(['2026-12-01', '2026-12-01'], HOJE), 'Há datas repetidas.');
  assert.equal(validarDatas(Array.from({ length: 7 }, (_, i) => `2026-12-0${i + 1}`), HOJE), 'No máximo 6 revisões por vez.');
  assert.equal(validarDatas([''], HOJE), 'Preencha todas as datas.');
});

test('revisoesParaEncaixar', () => {
  const revisoes = [rev('venc', '2026-11-20'), rev('hoje', HOJE), rev('fut', '2026-11-25'), rev('feita', '2026-11-01', { status: 'feita' }),
    rev('canc', '2026-11-01', { status: 'cancelada' }), rev('arq', '2026-11-01', { card_id: 'Z' }), rev('agend', '2026-11-10'), rev('falhou', '2026-11-12'),
    rev('sumiu', '2026-11-01', { card_id: 'X' })];
  const blocks = [bloco({ revisao_id: 'agend', date: '2026-11-25' }), bloco({ revisao_id: 'falhou', date: '2026-11-13', status: 'missed' })];
  const e = revisoesParaEncaixar({ revisoes, cards, blocks, hoje: HOJE });
  assert.deepEqual(e.map((x) => x.revisao_id), ['falhou', 'venc', 'hoje']);
  assert.deepEqual(e[0], { tipo: 'revisao', card_id: 'K', item_id: null, fixed_date: null, revisao_id: 'falhou', data: '2026-11-12', reagendar: true });
  assert.equal(e[1].reagendar, false);
});

test('statusDaRevisao', () => {
  assert.equal(statusDaRevisao(bloco({ revisao_id: 'r' }), 'done'), 'feita');
  assert.equal(statusDaRevisao(bloco({ revisao_id: 'r', status: 'done' }), 'planned'), 'pendente');
  assert.equal(statusDaRevisao(bloco({ revisao_id: 'r', status: 'done' }), 'missed'), 'pendente');
  assert.equal(statusDaRevisao(bloco({ revisao_id: 'r' }), 'missed'), null);
  assert.equal(statusDaRevisao(bloco({}), 'done'), null);
});

test('textoDasRevisoes', () => {
  const r = [rev('a', '2026-12-01', { status: 'feita' }), rev('b', '2026-12-24'), rev('c', '2026-12-10', { status: 'cancelada' }), rev('d', '2026-12-05', { card_id: 'Z' })];
  assert.equal(textoDasRevisoes(r, 'K'), 'Revisões: 1/12 ✓ · 24/12');
  assert.equal(textoDasRevisoes([], 'K'), null);
});
