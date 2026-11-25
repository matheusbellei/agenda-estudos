import test from 'node:test';
import assert from 'node:assert/strict';
import { grupoDoArquivo, arquivoAgrupado, GRUPOS_DO_ARQUIVO } from '../../js/regras/arquivo.js';

const AGORA = Date.parse('2026-11-24T12:00:00Z');
const dias = (n) => new Date(AGORA - n * 86400000).toISOString();

test('grupoDoArquivo: faixas de dias e sem data', () => {
  assert.equal(grupoDoArquivo(dias(0), AGORA), 'Nos últimos 7 dias');
  assert.equal(grupoDoArquivo(dias(7), AGORA), 'Nos últimos 7 dias');
  assert.equal(grupoDoArquivo(dias(8), AGORA), 'Há mais de 7 dias');
  assert.equal(grupoDoArquivo(dias(14), AGORA), 'Há mais de 7 dias');
  assert.equal(grupoDoArquivo(dias(15), AGORA), 'Há mais de 14 dias');
  assert.equal(grupoDoArquivo(dias(30), AGORA), 'Há mais de 14 dias');
  assert.equal(grupoDoArquivo(dias(31), AGORA), 'Há mais de 30 dias');
  assert.equal(grupoDoArquivo(null, AGORA), 'Sem data');
});

test('arquivoAgrupado: grupos na ordem fixa, mais recente primeiro, vazios fora', () => {
  const cards = [
    { id: 'a', title: 'Velho', archived_at: dias(40) },
    { id: 'b', title: 'Ontem', archived_at: dias(1) },
    { id: 'c', title: 'Hoje', archived_at: dias(0) },
    { id: 'd', title: 'Sem', archived_at: null },
  ];
  const g = arquivoAgrupado(cards, { agoraMs: AGORA });
  assert.deepEqual(g.map((x) => x.titulo), ['Nos últimos 7 dias', 'Há mais de 30 dias', 'Sem data']);
  assert.deepEqual(g[0].cards.map((c) => c.id), ['c', 'b']);
  assert.deepEqual(GRUPOS_DO_ARQUIVO, ['Nos últimos 7 dias', 'Há mais de 7 dias', 'Há mais de 14 dias', 'Há mais de 30 dias', 'Sem data']);
});

test('arquivoAgrupado: busca ignora acentos e maiúsculas; "Sem data" em ordem alfabética', () => {
  const cards = [
    { id: 'a', title: 'Revisão de Função', archived_at: null },
    { id: 'b', title: 'Aula 1', archived_at: null },
    { id: 'c', title: 'funcao afim', archived_at: dias(2) },
  ];
  const g = arquivoAgrupado(cards, { busca: 'FUNÇÃO', agoraMs: AGORA });
  assert.deepEqual(g.flatMap((x) => x.cards.map((c) => c.id)), ['c', 'a']);
  assert.deepEqual(arquivoAgrupado(cards, { agoraMs: AGORA })[1].cards.map((c) => c.id), ['b', 'a']);
});
