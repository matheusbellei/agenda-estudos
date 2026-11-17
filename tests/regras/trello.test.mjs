import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diasDaRegra, corDaEtiqueta, planoDeImportacao } from '../../js/regras/trello.js';

const exemplo = () => JSON.parse(readFileSync(new URL('../fixtures/trello-exemplo.json', import.meta.url), 'utf8'));
const vazio = { categories: [], lists: [], cards: [], items: [], attachments: [] };
const plano = () => planoDeImportacao(exemplo(), vazio);
const card = (p, titulo) => p.cards.find((c) => c.title === titulo);

test('diasDaRegra: BYDAY, diário, semanal sem BYDAY e regra ausente', () => {
  assert.deepEqual(diasDaRegra('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO'), [1]);
  assert.deepEqual(diasDaRegra('RRULE:FREQ=WEEKLY;BYDAY=SA,SU'), [6, 7]);
  assert.deepEqual(diasDaRegra('RRULE:FREQ=DAILY'), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(diasDaRegra(null), []);
  assert.deepEqual(diasDaRegra(undefined), []);
  assert.deepEqual(diasDaRegra('RRULE:FREQ=MONTHLY'), []);
  assert.deepEqual(diasDaRegra('DTSTART;TZID=America/Sao_Paulo:20260503T230000\nRRULE:FREQ=WEEKLY'), [7]);
});

test('corDaEtiqueta: cores conhecidas e desconhecida', () => {
  assert.equal(corDaEtiqueta('red'), '#B5543A');
  assert.equal(corDaEtiqueta('sky'), '#6FA3B8');
  assert.equal(corDaEtiqueta('black'), '#3B2416');
  assert.equal(corDaEtiqueta('magenta'), '#6F4E37');
});

test('plano do exemplo: contagens', () => {
  const p = plano();
  assert.equal(p.categories.length, 2);
  assert.deepEqual(p.lists.map((l) => l.name), ['Backlog', 'Em andamento', 'Concluído']);
  assert.equal(p.cards.length, 8);
  assert.equal(p.items.length, 4);
  assert.deepEqual(p.categories.map((c) => c.color), ['#4A6C8C', '#C68B59']);
  assert.equal(p.cardCategories.length, 3);
  assert.deepEqual(p.resumo, {
    cards: 8, itens: 4, categorias: 2, listas: 3, fixas: 2, arquivados: 3,
    pendentes: [{ card: 'Trilha de exemplo', arquivo: 'apostila.pdf' }], jaExistiam: 0,
  });
});

test('listas de andamento e de conclusão', () => {
  const p = plano();
  const por = (n) => p.lists.find((l) => l.name === n);
  assert.equal(por('Em andamento').is_active, true);
  assert.equal(por('Em andamento').is_done, false);
  assert.equal(por('Concluído').is_done, true);
  assert.equal(por('Backlog').is_active, false);
  assert.equal(por('Backlog').position, 16384);
});

test('fixas: sem lista, dias da regra, arquivada com 7 dias', () => {
  const p = plano();
  const quinta = card(p, 'Fixa de quinta');
  const diaria = card(p, 'Fixa diária arquivada');
  for (const f of [quinta, diaria]) { assert.equal(f.is_fixed, true); assert.equal(f.list_trello_id, null); }
  assert.deepEqual(quinta.fixed_days, [4]);
  assert.equal(quinta.archived, false);
  assert.equal(diaria.archived, true);
  assert.deepEqual(diaria.fixed_days, [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(card(p, 'Ler o guia de exemplo').is_fixed, false);
});

test('card de lista fechada e card arquivado', () => {
  const p = plano();
  const fechada = card(p, 'Card de lista fechada');
  assert.equal(fechada.archived, true);
  assert.equal(fechada.list_trello_id, null);
  const arq = card(p, 'Card arquivado');
  assert.equal(arq.archived, true);
  assert.equal(arq.list_trello_id, p.lists[0].trello_id);
});

test('item com tabulação ganha um espaço; estado feito preservado', () => {
  const p = plano();
  assert.deepEqual(p.items.map((i) => i.title), ['Aula 1', 'Aula 2 Introdução ao tema', 'Aula 3', 'Aula 4']);
  assert.deepEqual(p.items.map((i) => i.done), [true, true, false, false]);
  assert.equal(p.items[0].group_name, 'Plano de estudo');
  assert.equal(p.items[0].card_trello_id, card(p, 'Trilha de exemplo').trello_id);
  assert.deepEqual(p.items.map((i) => i.position), [16384, 32768, 49152, 65536]);
});

test('notes: descrição intacta; comentário acrescentado ao fim', () => {
  const json = exemplo();
  const descricao = json.cards.find((c) => c.name === 'Ler o guia de exemplo').desc;
  const p = planoDeImportacao(json, vazio);
  assert.equal(card(p, 'Card com duas etiquetas').notes, '');
  assert.equal(card(p, 'Ler o guia de exemplo').notes, `${descricao}\n\n---\nComentário de 04/08/2026: Anotei isto depois.`);
  json.actions = [];
  assert.equal(card(planoDeImportacao(json, vazio), 'Ler o guia de exemplo').notes, descricao);
});

test('anexos: enviado vira pending, link vira link com url', () => {
  const p = plano();
  const enviado = p.attachments.find((a) => a.kind === 'pending');
  assert.equal(enviado.name, 'apostila.pdf');
  assert.equal(enviado.url, null);
  assert.equal(enviado.card_trello_id, card(p, 'Trilha de exemplo').trello_id);
  const link = p.attachments.find((a) => a.kind === 'link');
  assert.equal(link.url, 'https://www.youtube.com/watch?v=exemplo');
  assert.equal(link.name, 'Vídeo de exemplo');
  assert.deepEqual(p.resumo.pendentes, [{ card: 'Trilha de exemplo', arquivo: 'apostila.pdf' }]);
});

test('datas: created_at vem do id; completed_at do due concluído', () => {
  const p = plano();
  assert.equal(card(p, 'Ler o guia de exemplo').created_at, '2026-08-03T23:49:37.000Z');
  assert.equal(card(p, 'Ler o guia de exemplo').completed_at, null);
  assert.equal(card(p, 'Card concluído').completed_at, '2026-09-10T15:00:00.000Z');
});

test('card com duas etiquetas liga as duas categorias', () => {
  const p = plano();
  const id = card(p, 'Card com duas etiquetas').trello_id;
  assert.equal(p.cardCategories.filter((cc) => cc.card_trello_id === id).length, 2);
});

test('segunda importação: plano vazio e tudo conta como já existente', () => {
  const primeira = plano();
  const segunda = planoDeImportacao(exemplo(), primeira);
  for (const t of ['categories', 'lists', 'cards', 'items', 'attachments', 'cardCategories']) assert.deepEqual(segunda[t], [], t);
  assert.equal(segunda.resumo.jaExistiam, 8);
  assert.equal(segunda.resumo.cards, 0);
  assert.deepEqual(segunda.resumo.pendentes, []);
});

test('importação parcial: só entra o que falta', () => {
  const primeira = plano();
  const parcial = { ...primeira, cards: primeira.cards.slice(0, 5) };
  const p = planoDeImportacao(exemplo(), parcial);
  assert.equal(p.cards.length, 3);
  assert.equal(p.resumo.jaExistiam, 5);
});

test('arquivo que não é do Trello é recusado', () => {
  const msg = 'Este arquivo não parece ser um quadro exportado do Trello.';
  assert.throws(() => planoDeImportacao({}, vazio), { message: msg });
  assert.throws(() => planoDeImportacao({ lists: [] }, vazio), { message: msg });
  assert.throws(() => planoDeImportacao(null, vazio), { message: msg });
  assert.throws(() => planoDeImportacao([], vazio), { message: msg });
});

test('mais de uma checklist no card: grupos em sequência, na ordem das checklists', () => {
  const json = exemplo();
  json.checklists.unshift({ id: 'ck0', name: 'Semana', idCard: json.checklists[0].idCard, pos: 1, checkItems: [
    { id: 'it0', name: 'A', pos: 16384, state: 'incomplete' }, { id: 'it00', name: 'B', pos: 32768, state: 'incomplete' }] });
  const p = planoDeImportacao(json, vazio);
  const ordenados = [...p.items].sort((a, b) => a.position - b.position);
  assert.deepEqual(ordenados.map((i) => i.group_name), ['Semana', 'Semana', ...Array(4).fill('Plano de estudo')]);
});

test('plano não marca lista ativa nem de conclusão quando o app já tem uma', () => {
  const existentes = { ...vazio, lists: [{ id: 'l1', name: 'Fazendo', is_active: true, is_done: false, trello_id: null },
    { id: 'l2', name: 'Feito', is_active: false, is_done: true, trello_id: null }] };
  const p = planoDeImportacao(exemplo(), existentes);
  assert.ok(p.lists.length > 0);
  assert.equal(p.lists.filter((l) => l.is_active).length, 0);
  assert.equal(p.lists.filter((l) => l.is_done).length, 0);
  const soAtiva = planoDeImportacao(exemplo(), { ...vazio, lists: [existentes.lists[0]] });
  assert.equal(soAtiva.lists.filter((l) => l.is_active).length, 0);
  assert.deepEqual(soAtiva.lists.filter((l) => l.is_done).map((l) => l.name), ['Concluído']);
});
