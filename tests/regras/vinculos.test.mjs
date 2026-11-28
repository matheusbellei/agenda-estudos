import test from 'node:test';
import assert from 'node:assert/strict';
import { colunasComCards, arvoreParaEscolher } from '../../js/regras/vinculos.js';

test('colunasComCards: colunas na ordem do Quadro, cards em ordem alfabética', () => {
  const lists = [{ id: 'b', name: 'Fazendo', position: 2 }, { id: 'a', name: 'A fazer', position: 1 }];
  const cards = [
    { id: '1', title: 'Zebra', list_id: 'a' },
    { id: '2', title: 'Árvore', list_id: 'a' },
    { id: '3', title: 'Meio', list_id: 'b' },
  ];
  const r = colunasComCards({ lists, cards });
  assert.deepEqual(r.map((c) => c.nome), ['A fazer', 'Fazendo']);
  assert.deepEqual(r[0].filhos.map((c) => c.nome), ['Árvore', 'Zebra']);
});

test('colunasComCards: ignora cards arquivados e colunas vazias', () => {
  const lists = [{ id: 'a', name: 'Vazia', position: 1 }, { id: 'b', name: 'Cheia', position: 2 }];
  const cards = [{ id: '1', title: 'Velho', list_id: 'a', archived: true }, { id: '2', title: 'Novo', list_id: 'b' }];
  const r = colunasComCards({ lists, cards });
  assert.deepEqual(r.map((c) => c.nome), ['Cheia']);
});

test('arvoreParaEscolher: grupo é escolhível e abre; baralho é folha escolhível', () => {
  const baralhos = [
    { id: 'g', nome: 'Verbos', e_grupo: true, pai_id: null },
    { id: 'b', nome: 'Presente', e_grupo: false, pai_id: 'g' },
    { id: 'c', nome: 'Solto', e_grupo: false, pai_id: null },
  ];
  const r = arvoreParaEscolher(baralhos);
  const g = r.find((n) => n.id === 'g');
  assert.equal(g.escolhivel, true);
  assert.equal(g.grupo, true);
  assert.deepEqual(g.filhos.map((n) => n.id), ['b']);
  assert.equal(r.find((n) => n.id === 'c').escolhivel, true);
});
