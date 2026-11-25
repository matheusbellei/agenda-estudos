import test from 'node:test';
import assert from 'node:assert/strict';
import { arvoreDeBaralhos, baralhosDentro, destinosPossiveis, contagemDoGrupo, filhosAoExcluirGrupo, paisPrimeiro, grupoQueDefineLimites } from '../../js/regras/baralhos.js';

// Idiomas (grupo) › Espanhol (grupo) › Verbos, Vocabulário ; Idiomas › Inglês ; Física (sem grupo)
const B = [
  { id: 'id', nome: 'Idiomas', e_grupo: true, pai_id: null },
  { id: 'es', nome: 'Espanhol', e_grupo: true, pai_id: 'id' },
  { id: 've', nome: 'Verbos', e_grupo: false, pai_id: 'es' },
  { id: 'vo', nome: 'Vocabulário', e_grupo: false, pai_id: 'es' },
  { id: 'in', nome: 'Inglês', e_grupo: false, pai_id: 'id' },
  { id: 'fi', nome: 'Física', e_grupo: false, pai_id: null },
];

test('arvoreDeBaralhos: grupos primeiro, depois baralhos, em ordem alfabética, em níveis', () => {
  const a = arvoreDeBaralhos(B);
  assert.deepEqual(a.map((n) => n.baralho.id), ['id', 'fi']);
  assert.deepEqual(a[0].filhos.map((n) => n.baralho.id), ['es', 'in']);
  assert.deepEqual(a[0].filhos[0].filhos.map((n) => n.baralho.id), ['ve', 'vo']);
});

test('arvoreDeBaralhos: pai sumido ou que não é grupo vai para a raiz', () => {
  const a = arvoreDeBaralhos([{ id: 'x', nome: 'X', e_grupo: false, pai_id: 'sumiu' }, { id: 'y', nome: 'Y', e_grupo: false, pai_id: 'x' }]);
  assert.deepEqual(a.map((n) => n.baralho.id), ['x', 'y']);
});

test('baralhosDentro: só baralhos (não grupos), em qualquer nível', () => {
  assert.deepEqual(baralhosDentro(B, 'id').sort(), ['in', 've', 'vo']);
  assert.deepEqual(baralhosDentro(B, 'es').sort(), ['ve', 'vo']);
});

test('destinosPossiveis: só grupos, nunca o próprio nem um de dentro dele', () => {
  assert.deepEqual(destinosPossiveis(B, 'id'), []);
  assert.deepEqual(destinosPossiveis(B, 'es').map((g) => g.id), ['id']);
  assert.deepEqual(destinosPossiveis(B, 'fi').map((g) => g.id), ['es', 'id']);
});

test('contagemDoGrupo: soma os baralhos de dentro', () => {
  const por = new Map([['ve', { novos: 2, revisar: 1 }], ['in', { novos: 0, revisar: 4 }], ['fi', { novos: 9, revisar: 9 }]]);
  assert.deepEqual(contagemDoGrupo(B, por, 'id'), { novos: 2, revisar: 5 });
  assert.deepEqual(contagemDoGrupo(B, por, 'es'), { novos: 2, revisar: 1 });
});

test('filhosAoExcluirGrupo: o que está dentro sobe para o grupo de cima', () => {
  assert.deepEqual(filhosAoExcluirGrupo(B, 'es'), [{ id: 've', pai_id: 'id' }, { id: 'vo', pai_id: 'id' }]);
  assert.deepEqual(filhosAoExcluirGrupo(B, 'id'), [{ id: 'es', pai_id: null }, { id: 'in', pai_id: null }]);
});

test('paisPrimeiro: cada grupo vem antes do que está dentro dele (restauração do backup)', () => {
  const embaralhado = [B[2], B[4], B[1], B[5], B[0], B[3]];
  const ordem = paisPrimeiro(embaralhado).map((b) => b.id);
  assert.equal(ordem.length, 6);
  for (const b of B) if (b.pai_id) assert.ok(ordem.indexOf(b.pai_id) < ordem.indexOf(b.id), b.id);
});

test('grupoQueDefineLimites: o grupo mais de cima com limites manda; sem nenhum, null', () => {
  const com = B.map((b) => (b.id === 'id' ? { ...b, limites_do_grupo: true, novos_dia: 10, revisoes_dia: 100 }
    : b.id === 'es' ? { ...b, limites_do_grupo: true, novos_dia: 3, revisoes_dia: 30 } : b));
  assert.equal(grupoQueDefineLimites(com, 've').id, 'id');
  assert.equal(grupoQueDefineLimites(com, 'in').id, 'id');
  assert.equal(grupoQueDefineLimites(com, 'fi'), null);
  const soEs = B.map((b) => (b.id === 'es' ? { ...b, limites_do_grupo: true } : b));
  assert.equal(grupoQueDefineLimites(soEs, 've').id, 'es');
  assert.equal(grupoQueDefineLimites(soEs, 'in'), null);
});
