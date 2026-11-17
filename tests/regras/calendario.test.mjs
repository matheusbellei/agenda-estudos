import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ocorrenciasDeCompromissos, blocosDoPeriodo, horariosLivres,
  faixasDaSemana, limitesDoDia, colunas, ajustarAFatia,
} from '../../js/regras/calendario.js';

const compromisso = (extra = {}) => ({
  id: 'c1', title: 'Aula', category_id: 'cat1', days: [1, 3],
  start_min: 480, end_min: 600, valid_from: '2026-11-01', valid_to: null, ...extra,
});

test('ocorrências: valid_from limita o começo', () => {
  const r = ocorrenciasDeCompromissos([compromisso({ valid_from: '2026-11-18' })], '2026-11-16', '2026-11-22');
  assert.equal(r.length, 1);
  assert.equal(r[0].date, '2026-11-18');
  assert.equal(r[0].virtual, true);
  assert.equal(r[0].commitment_id, 'c1');
  assert.equal(r[0].kind, 'commitment');
  assert.equal(r[0].status, 'planned');
  assert.equal(r[0].instead_note, '');
});

test('ocorrências: valid_to inclusivo não aparece no dia seguinte', () => {
  const r = ocorrenciasDeCompromissos([compromisso({ days: [1, 2], valid_to: '2026-11-16' })], '2026-11-16', '2026-11-22');
  assert.deepEqual(r.map((b) => b.date), ['2026-11-16']);
  assert.equal(ocorrenciasDeCompromissos([compromisso({ days: [2], valid_to: '2026-11-16' })], '2026-11-17', '2026-11-17').length, 0);
});

test('período: bloco gravado done no mesmo (commitment_id, date) substitui a virtual', () => {
  const gravado = { id: 'b1', commitment_id: 'c1', date: '2026-11-16', start_min: 480, end_min: 600, kind: 'commitment', status: 'done', cancelled: false };
  const r = blocosDoPeriodo([compromisso()], [gravado], '2026-11-16', '2026-11-16');
  assert.equal(r.length, 1);
  assert.equal(r[0].status, 'done');
  assert.equal(r[0].virtual, undefined);
});

test('período: bloco gravado cancelled esconde a ocorrência do dia', () => {
  const gravado = { id: 'b1', commitment_id: 'c1', date: '2026-11-16', start_min: 480, end_min: 600, kind: 'commitment', status: 'planned', cancelled: true };
  const r = blocosDoPeriodo([compromisso()], [gravado], '2026-11-16', '2026-11-16');
  assert.equal(r.length, 0);
});

test('período: ordena por data e depois por start_min', () => {
  const blocks = [
    { id: 'b2', date: '2026-11-17', start_min: 300, end_min: 360, kind: 'study', cancelled: false },
    { id: 'b1', date: '2026-11-16', start_min: 900, end_min: 960, kind: 'study', cancelled: false },
  ];
  const r = blocosDoPeriodo([compromisso()], blocks, '2026-11-16', '2026-11-17');
  assert.deepEqual(r.map((b) => `${b.date}@${b.start_min}`), ['2026-11-16@480', '2026-11-16@900', '2026-11-17@300']);
});

test('horariosLivres: dia vazio devolve o período inteiro', () => {
  assert.deepEqual(horariosLivres([], 360, 1320), [{ start_min: 360, end_min: 1320 }]);
});

test('horariosLivres: blocos sobrepostos 480-600 e 540-720', () => {
  const blocos = [{ start_min: 480, end_min: 600, status: 'planned' }, { start_min: 540, end_min: 720, status: 'planned' }];
  assert.deepEqual(horariosLivres(blocos, 360, 1320), [
    { start_min: 360, end_min: 480 }, { start_min: 720, end_min: 1320 },
  ]);
});

test('horariosLivres: bloco que começa antes do período; limitesDoDia alarga', () => {
  const blocos = [{ start_min: 300, end_min: 420, status: 'planned' }];
  assert.deepEqual(horariosLivres(blocos, 360, 1320), [{ start_min: 420, end_min: 1320 }]);
  assert.deepEqual(limitesDoDia(blocos, 360, 1320), { inicio: 300, fim: 1320 });
});

test('horariosLivres: bloco missed continua ocupando o horário', () => {
  const blocos = [{ start_min: 480, end_min: 600, status: 'missed' }];
  assert.deepEqual(horariosLivres(blocos, 360, 1320), [
    { start_min: 360, end_min: 480 }, { start_min: 600, end_min: 1320 },
  ]);
});

test('faixasDaSemana: bloco 470-610 aparece em três faixas de 120', () => {
  const bloco = { start_min: 470, end_min: 610, status: 'planned' };
  const f = faixasDaSemana([bloco], 360, 1320, 120);
  assert.equal(f.length, 8);
  const com = f.filter((x) => x.blocos.length > 0).map((x) => `${x.start_min}-${x.end_min}`);
  assert.deepEqual(com, ['360-480', '480-600', '600-720']);
  assert.equal(f.find((x) => x.start_min === 480).livre_min, 0);
});

test('colunas: dois sobrepostos lado a lado e um isolado', () => {
  const r = colunas([
    { id: 'a', start_min: 480, end_min: 600 },
    { id: 'b', start_min: 540, end_min: 660 },
    { id: 'c', start_min: 800, end_min: 860 },
  ]);
  const por = Object.fromEntries(r.map((b) => [b.id, b]));
  assert.equal(por.a.cols, 2); assert.equal(por.b.cols, 2);
  assert.deepEqual([por.a.col, por.b.col], [0, 1]);
  assert.equal(por.c.cols, 1); assert.equal(por.c.col, 0);
});

test('ajustarAFatia: 487 com fatia 30 vira 480', () => {
  assert.equal(ajustarAFatia(487, 30), 480);
});

test('ajustarAFatia: 1439 com fatia 30 vira 1440', () => {
  assert.equal(ajustarAFatia(1439, 30), 1440);
});
