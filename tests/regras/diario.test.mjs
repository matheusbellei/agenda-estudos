import test from 'node:test';
import assert from 'node:assert/strict';
import { registrosDoDiario } from '../../js/regras/diario.js';
import { buscar } from '../../js/regras/busca.js';

const cats = [{ id: 'I', name: 'Idiomas', parent_id: null }, { id: 'E', name: 'Espanhol', parent_id: 'I' }, { id: 'M', name: 'Matemática', parent_id: null }];
const b = (id, date, start_min, extra) => ({ id, date, start_min, end_min: start_min + 60, status: 'done', title: id, cancelled: false, card_id: null, item_id: null, category_id: null, diario: '', ...extra });
const dados = {
  categories: cats,
  cards: [{ id: 'K', title: 'Curso de Espanhol' }],
  items: [{ id: 'i1', card_id: 'K', title: 'Aula 3' }],
  blocks: [
    b('b1', '2026-11-16', 480, { card_id: 'K', item_id: 'i1', category_id: 'E', diario: 'Verbos no pretérito.' }),
    b('b2', '2026-11-17', 600, { category_id: 'M', diario: 'Equações de segundo grau.' }),
    b('b3', '2026-11-17', 900, { category_id: 'I', diario: 'Leitura em voz alta.' }),
    b('b4', '2026-11-18', 600, { category_id: 'I', diario: '   ' }),
  ],
};

test('registrosDoDiario: mais novo primeiro, sem diário vazio, com card e item', () => {
  const r = registrosDoDiario(dados);
  assert.deepEqual(r.map((x) => x.bloco.id), ['b3', 'b2', 'b1']);
  assert.deepEqual([r[2].card?.title, r[2].item?.title, r[2].texto], ['Curso de Espanhol', 'Aula 3', 'Verbos no pretérito.']);
});

test('registrosDoDiario: filtra por card, por tag mãe (com subtags) e por termo sem acento', () => {
  assert.deepEqual(registrosDoDiario(dados, { cardId: 'K' }).map((x) => x.bloco.id), ['b1']);
  assert.deepEqual(registrosDoDiario(dados, { tagId: 'I' }).map((x) => x.bloco.id), ['b3', 'b1']);
  assert.deepEqual(registrosDoDiario(dados, { termo: 'preterito' }).map((x) => x.bloco.id), ['b1']);
  assert.deepEqual(registrosDoDiario(dados, { termo: 'segundo grau' }).map((x) => x.bloco.id), ['b2']);
});

test('busca geral acha o texto do diário no campo "diario"', () => {
  const r = buscar('equacoes', { ...dados, occurrences: [], card_categories: [] });
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].campo, r[0].bloco_id], ['diario', 'b2']);
});
