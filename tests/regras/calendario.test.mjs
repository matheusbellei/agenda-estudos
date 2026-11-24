import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ocorrenciasDeCompromissos, blocosDoPeriodo, horariosLivres,
  faixasDaSemana, limitesDoDia, posicionar, inicioMaisUmaHora, ajustarAFatia,
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

const pos = (blocos) => Object.fromEntries(posicionar(blocos).map((b) => [b.id, b]));
const trabalho = { id: 't', start_min: 462, end_min: 1050 };

test('posicionar: estudo 720-780 dentro do trabalho 462-1050 → trabalho fundo, estudo largura inteira e acima', () => {
  const r = pos([trabalho, { id: 'e', start_min: 720, end_min: 780 }]);
  assert.equal(r.t.fundo, true); assert.equal(r.e.fundo, false);
  assert.equal(r.e.recuo, 0); assert.equal(r.e.total, 1); assert.equal(r.t.total, 1);
  assert.ok(r.e.camada > r.t.camada);
});

test('posicionar: estudo 462-540 começa junto com o trabalho → lado a lado, ninguém é fundo', () => {
  const r = pos([trabalho, { id: 'e', start_min: 462, end_min: 540 }]);
  assert.equal(r.t.fundo, false); assert.equal(r.e.fundo, false);
  assert.deepEqual([r.t.total, r.e.total], [2, 2]);
  assert.deepEqual(new Set([r.t.indice, r.e.indice]), new Set([0, 1]));
});

test('posicionar: início e fim iguais → lado a lado', () => {
  const r = pos([{ id: 'a', start_min: 600, end_min: 660 }, { id: 'b', start_min: 600, end_min: 660 }]);
  assert.deepEqual([r.a.total, r.b.total], [2, 2]);
  assert.notEqual(r.a.indice, r.b.indice);
  assert.equal(r.a.fundo || r.b.fundo, false);
});

test('posicionar: 540-660 e 600-720 → o segundo recuado e acima, nenhum fundo', () => {
  const r = pos([{ id: 'a', start_min: 540, end_min: 660 }, { id: 'b', start_min: 600, end_min: 720 }]);
  assert.equal(r.a.recuo, 0); assert.equal(r.b.recuo, 1);
  assert.ok(r.b.camada > r.a.camada);
  assert.equal(r.a.fundo || r.b.fundo, false);
  assert.deepEqual([r.a.total, r.b.total], [1, 1]);
});

test('posicionar: 540-660 e 560-700 (20 min de diferença) → lado a lado', () => {
  const r = pos([{ id: 'a', start_min: 540, end_min: 660 }, { id: 'b', start_min: 560, end_min: 700 }]);
  assert.deepEqual([r.a.total, r.b.total], [2, 2]);
  assert.deepEqual([r.a.recuo, r.b.recuo], [0, 0]);
});

test('posicionar: trabalho com almoço 720-780 e reunião 900-960 → dois contidos de largura inteira', () => {
  const r = pos([trabalho, { id: 'al', start_min: 720, end_min: 780 }, { id: 're', start_min: 900, end_min: 960 }]);
  assert.equal(r.t.fundo, true);
  for (const k of ['al', 're']) { assert.equal(r[k].total, 1); assert.equal(r[k].recuo, 0); assert.ok(r[k].camada > r.t.camada); }
});

test('posicionar: bloco isolado → sem fundo, sem recuo, largura inteira', () => {
  const r = pos([{ id: 'a', start_min: 600, end_min: 660 }]);
  assert.deepEqual([r.a.fundo, r.a.recuo, r.a.indice, r.a.total], [false, 0, 0, 1]);
});

test('posicionar: 120 min contendo 15 min → o de 120 é fundo', () => {
  const r = pos([{ id: 'a', start_min: 600, end_min: 720 }, { id: 'b', start_min: 660, end_min: 675 }]);
  assert.equal(r.a.fundo, true); assert.equal(r.b.fundo, false);
});

test('posicionar: dois que se cruzam dentro do trabalho → fundo + cascata entre eles', () => {
  const r = pos([trabalho, { id: 'a', start_min: 600, end_min: 700 }, { id: 'b', start_min: 660, end_min: 760 }]);
  assert.equal(r.t.fundo, true);
  assert.equal(r.a.recuo, 0); assert.equal(r.b.recuo, 1);
  assert.ok(r.b.camada > r.a.camada && r.a.camada > r.t.camada);
});

test('posicionar: não altera os blocos recebidos e mantém os campos', () => {
  const entrada = [{ id: 'a', start_min: 600, end_min: 660, title: 'X' }];
  const r = posicionar(entrada);
  assert.equal(r[0].title, 'X'); assert.equal('fundo' in entrada[0], false);
});

test('inicioMaisUmaHora: 600 dentro do trabalho sem nada depois → 600-660', () => {
  assert.deepEqual(inicioMaisUmaHora(600, [trabalho], 1440), { start_min: 600, end_min: 660 });
});

test('inicioMaisUmaHora: 600 com almoço 630-690 → 600-630', () => {
  assert.deepEqual(inicioMaisUmaHora(600, [trabalho, { start_min: 630, end_min: 690 }], 1440), { start_min: 600, end_min: 630 });
});

test('inicioMaisUmaHora: perto do fim do período e no fim', () => {
  assert.deepEqual(inicioMaisUmaHora(1410, [], 1440), { start_min: 1410, end_min: 1440 });
  assert.equal(inicioMaisUmaHora(1440, [], 1440), null);
  assert.deepEqual(inicioMaisUmaHora(1300, [], 1320), { start_min: 1300, end_min: 1320 });
});

test('ajustarAFatia: 487 com fatia 30 vira 480', () => {
  assert.equal(ajustarAFatia(487, 30), 480);
});

test('ajustarAFatia: 1439 com fatia 30 vira 1440', () => {
  assert.equal(ajustarAFatia(1439, 30), 1440);
});

test('ocorrências: regra com card leva card_id e vira kind study; sem card continua commitment', () => {
  const [comCard] = ocorrenciasDeCompromissos([compromisso({ card_id: 'k1' })], '2026-11-16', '2026-11-16');
  assert.deepEqual([comCard.card_id, comCard.kind], ['k1', 'study']);
  const [semCard] = ocorrenciasDeCompromissos([compromisso()], '2026-11-16', '2026-11-16');
  assert.deepEqual([semCard.card_id, semCard.kind], [null, 'commitment']);
});

test('ocorrências levam o lembrete da fixa', () => {
  const [o] = ocorrenciasDeCompromissos([compromisso({ lembrete_min: 30 })], '2026-11-16', '2026-11-16');
  assert.equal(o.lembrete_min, 30);
  const [p] = ocorrenciasDeCompromissos([compromisso()], '2026-11-16', '2026-11-16');
  assert.equal(p.lembrete_min, null);
});
