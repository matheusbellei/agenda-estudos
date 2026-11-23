import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, buscar } from '../../js/regras/busca.js';

const vazio = { cards: [], items: [], blocks: [], card_categories: [] };
const dados = (parte) => ({ ...vazio, ...parte });

test('normalizar: minúsculas e sem acentos', () => {
  assert.equal(normalizar('Ética É'), 'etica e');
});

test('termo sem acento acha texto acentuado e o trecho marca o achado', () => {
  const [r] = buscar('semantica', dados({ cards: [{ id: 'c1', title: 'Linguística', notes: 'Estudo da Semântica formal.' }] }));
  assert.equal(r.campo, 'notas');
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'Semântica');
  assert.equal(r.item_id, null);
  assert.equal(r.bloco_id, null);
});

test('todas as palavras do termo têm de estar no mesmo campo', () => {
  const cards = [
    { id: 'c1', title: 'A', notes: 'sintaxe e semântica juntas' },
    { id: 'c2', title: 'B', notes: 'só sintaxe aqui' },
    { id: 'c3', title: 'C', notes: 'sintaxe' },
  ];
  const r = buscar('sintaxe semantica', dados({ cards: cards.map((c, i) => (i === 2 ? { ...c, title: 'semântica' } : c)) }));
  assert.deepEqual(r.map((x) => x.card_id), ['c1']);
});

test('achado em notas de item devolve item_id e campo notas_item', () => {
  const r = buscar('morfologia', dados({
    cards: [{ id: 'c1', title: 'Curso de Python', notes: '' }],
    items: [{ id: 'i1', card_id: 'c1', title: 'Aula 3', notes: 'ver morfologia derivacional' }],
  }));
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].card_id, r[0].item_id, r[0].campo], ['c1', 'i1', 'notas_item']);
});

test('título de item é campo item', () => {
  const r = buscar('aula', dados({
    cards: [{ id: 'c1', title: 'Curso de Python', notes: '' }],
    items: [{ id: 'i1', card_id: 'c1', title: 'Aula 3', notes: '' }],
  }));
  assert.deepEqual(r.map((x) => [x.campo, x.item_id]), [['item', 'i1']]);
});

test('instead_note de bloco devolve no_lugar e bloco_id', () => {
  const r = buscar('passeio', dados({
    cards: [{ id: 'c1', title: 'Curso de Python', notes: '' }],
    blocks: [{ id: 'b1', card_id: 'c1', item_id: null, title: 'Curso de Python', status: 'missed', instead_note: 'Fui ao parque, passeio longo' }],
  }));
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].campo, r[0].bloco_id, r[0].card_id], ['no_lugar', 'b1', 'c1']);
});

test('bloco de card excluído ainda é achado, com card_id nulo', () => {
  const r = buscar('passeio', dados({ blocks: [{ id: 'b1', card_id: null, item_id: null, title: 'Antigo', status: 'missed', instead_note: 'passeio' }] }));
  assert.deepEqual([r[0].campo, r[0].card_id], ['no_lugar', null]);
});

test('arquivado aparece, depois dos não arquivados; campos na ordem título, item, notas, notas de item, no lugar', () => {
  const cards = [
    { id: 'arq', title: 'Prova antiga', notes: '', archived: true },
    { id: 'ok', title: 'Prova nova', notes: '', archived: false },
    { id: 'n', title: 'Outro', notes: 'prova em casa', archived: false },
    { id: 'ni', title: 'Mais', notes: '', archived: false },
  ];
  const items = [{ id: 'i1', card_id: 'ni', title: 'x', notes: 'a prova' }, { id: 'i2', card_id: 'n', title: 'Prova 1', notes: '' }];
  const blocks = [{ id: 'b1', card_id: 'ok', title: 'Prova nova', status: 'missed', instead_note: 'adiei a prova' }];
  const r = buscar('prova', dados({ cards, items, blocks }));
  assert.deepEqual(r.map((x) => [x.card_id, x.campo]), [
    ['ok', 'titulo'], ['arq', 'titulo'], ['n', 'item'], ['n', 'notas'], ['ni', 'notas_item'], ['ok', 'no_lugar'],
  ]);
});

test('filtro por categoria tira os cards sem ela', () => {
  const cards = [{ id: 'a', title: 'Verbo A', notes: '' }, { id: 'b', title: 'Verbo B', notes: '' }];
  const card_categories = [{ card_id: 'a', category_id: 'cat1' }, { card_id: 'b', category_id: 'cat2' }];
  const r = buscar('verbo', dados({ cards, card_categories }), { categoria: 'cat1' });
  assert.deepEqual(r.map((x) => x.card_id), ['a']);
});

test('trecho sem marcação Markdown', () => {
  const [r] = buscar('aula', dados({ cards: [{ id: 'c', title: 'T', notes: '# _**Aula 1**_' }] }));
  assert.equal(r.trecho, 'Aula 1');
  assert.doesNotMatch(r.trecho, /[#_*]/);
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'Aula');
});

test('Markdown: listas, citações, links e imagens mostram só o texto', () => {
  const notas = '> citação\n- item de lista\n1. numerado\n[texto do link](https://x.com/a_b) e ![figura](u.png) `código`';
  const [r] = buscar('numerado', dados({ cards: [{ id: 'c', title: 'T', notes: notas }] }));
  assert.equal(r.trecho, 'citação item de lista numerado texto do link e figura código');
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'numerado');
});

test('trecho tem até 60 caracteres de cada lado', () => {
  const notas = `${'a'.repeat(100)} alvo ${'b'.repeat(100)}`;
  const [r] = buscar('alvo', dados({ cards: [{ id: 'c', title: 'T', notes: notas }] }));
  assert.equal(r.inicio, 60);
  assert.equal(r.trecho.length, 60 + 4 + 60);
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'alvo');
});

test('no máximo 3 resultados por card e campo', () => {
  const [a] = [{ id: 'c', title: 'T', notes: 'gato. gato. gato. gato. gato.' }];
  assert.equal(buscar('gato', dados({ cards: [a] })).length, 3);
});

test('termo com menos de 2 caracteres devolve vazio', () => {
  const cards = [{ id: 'c', title: 'a', notes: 'a a a' }];
  assert.deepEqual(buscar('a', dados({ cards })), []);
  assert.deepEqual(buscar(' a ', dados({ cards })), []);
  assert.deepEqual(buscar('', dados({ cards })), []);
});

test('caracteres de expressão regular não lançam erro', () => {
  const cards = [{ id: 'c', title: 'C++ (x)', notes: '' }];
  const r = buscar('c++ (x)', dados({ cards }));
  assert.equal(r.length, 1);
  assert.doesNotThrow(() => buscar('[a-', dados({ cards })));
});

// ---- rodada de correções 1
const DECOMPOSTO = 'Semântica'; // "Semântica" com o circunflexo solto

test('normalizar: texto decomposto (NFD) vira o mesmo texto sem acento', () => {
  assert.equal(normalizar(`${DECOMPOSTO} Ética`), 'semantica etica');
});

test('texto decomposto é achado por termo sem acento; o trecho vem em NFC', () => {
  const [r] = buscar('semantica', dados({ cards: [{ id: 'c', title: 'T', notes: `Estudo da ${DECOMPOSTO} formal` }] }));
  assert.equal(r.campo, 'notas');
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'Semântica'.normalize('NFC'));
  assert.equal(r.trecho, r.trecho.normalize('NFC'));
});

test('termo digitado decomposto acha texto composto', () => {
  const r = buscar(DECOMPOSTO, dados({ cards: [{ id: 'c', title: 'T', notes: 'a Semântica formal' }] }));
  assert.equal(r.length, 1);
  assert.equal(r[0].trecho.slice(r[0].inicio, r[0].fim), 'Semântica');
});

test('asteriscos soltos ficam: 2*3 é achado; o destaque em par some', () => {
  const [r] = buscar('2*3', dados({ cards: [{ id: 'c', title: 'T', notes: 'calcule 2*3 e 4*5' }] }));
  assert.equal(r.trecho, 'calcule 2*3 e 4*5');
  assert.equal(r.trecho.slice(r.inicio, r.fim), '2*3');
  const [n] = buscar('negrito', dados({ cards: [{ id: 'c', title: 'T', notes: 'um **negrito** e ~~riscado~~ e `código`' }] }));
  assert.equal(n.trecho, 'um negrito e riscado e código');
});

test('no lugar: dos blocos de um card ficam os 3 mais recentes', () => {
  const blocks = [
    { id: 'b1', card_id: 'c', date: '2026-11-01', start_min: 600, title: 'x', status: 'missed', instead_note: 'parque' },
    { id: 'b2', card_id: 'c', date: '2026-11-05', start_min: 600, title: 'x', status: 'missed', instead_note: 'parque' },
    { id: 'b3', card_id: 'c', date: '2026-11-05', start_min: 900, title: 'x', status: 'missed', instead_note: 'parque' },
    { id: 'b4', card_id: 'c', date: '2026-11-03', start_min: 600, title: 'x', status: 'missed', instead_note: 'parque' },
  ];
  const r = buscar('parque', dados({ cards: [{ id: 'c', title: 'T', notes: '' }], blocks }));
  assert.deepEqual(r.map((x) => x.bloco_id), ['b3', 'b2', 'b4']);
});

test('trecho cortado avisa em qual lado', () => {
  const notas = `${'a'.repeat(100)} alvo ${'b'.repeat(100)}`;
  const [longo] = buscar('alvo', dados({ cards: [{ id: 'c', title: 'T', notes: notas }] }));
  assert.deepEqual([longo.cortado_antes, longo.cortado_depois], [true, true]);
  const [curto] = buscar('alvo', dados({ cards: [{ id: 'c', title: 'T', notes: `${'a'.repeat(59)} alvo` }] }));
  assert.deepEqual([curto.cortado_antes, curto.cortado_depois], [false, false]);
});

// ---- rodada de correções 2: campos de texto simples (títulos) também em NFC
test('título de card decomposto é achado e o trecho vem em NFC', () => {
  const [r] = buscar('semantica', dados({ cards: [{ id: 'c', title: `Estudo ${DECOMPOSTO}`, notes: '' }] }));
  assert.equal(r.campo, 'titulo');
  assert.equal(r.trecho, r.trecho.normalize('NFC'));
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'Semântica'.normalize('NFC'));
});

test('título de item decomposto é achado e o trecho vem em NFC', () => {
  const [r] = buscar('semantica', dados({
    cards: [{ id: 'c', title: 'T', notes: '' }],
    items: [{ id: 'i', card_id: 'c', title: `Aula de ${DECOMPOSTO}`, notes: '' }],
  }));
  assert.equal(r.campo, 'item');
  assert.equal(r.trecho, r.trecho.normalize('NFC'));
  assert.equal(r.trecho.slice(r.inicio, r.fim), 'Semântica'.normalize('NFC'));
});

// ---- ocorrências de fixas (occurrences.instead_note)
test('instead_note de ocorrência devolve no_lugar com card_id, bloco_id nulo e a data', () => {
  const r = buscar('passeio', dados({
    cards: [{ id: 'c1', title: 'Revisão semanal', notes: '' }],
    occurrences: [{ id: 'o1', card_id: 'c1', date: '2026-11-09', status: 'missed', instead_note: 'Fui ao parque, passeio longo' }],
  }));
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].campo, r[0].card_id, r[0].bloco_id, r[0].ocorrencia_data], ['no_lugar', 'c1', null, '2026-11-09']);
});

test('no lugar: blocos e ocorrências do mesmo card dividem o limite de 3, dos mais novos', () => {
  const cards = [{ id: 'c', title: 'T', notes: '' }];
  const blocks = [
    { id: 'b1', card_id: 'c', date: '2026-11-01', start_min: 600, title: 'x', status: 'missed', instead_note: 'parque' },
    { id: 'b2', card_id: 'c', date: '2026-11-08', start_min: 600, title: 'x', status: 'missed', instead_note: 'parque' },
  ];
  const occurrences = [
    { id: 'o1', card_id: 'c', date: '2026-11-02', instead_note: 'parque' },
    { id: 'o2', card_id: 'c', date: '2026-11-09', instead_note: 'parque' },
    { id: 'o3', card_id: 'c', date: '2026-11-03', instead_note: '' },
  ];
  const r = buscar('parque', dados({ cards, blocks, occurrences }));
  assert.deepEqual(r.map((x) => x.bloco_id ?? x.ocorrencia_data), ['2026-11-09', 'b2', '2026-11-02']);
});

test('ocorrência respeita o filtro de categoria do card', () => {
  const dadosBusca = dados({
    cards: [{ id: 'c', title: 'T', notes: '' }],
    card_categories: [{ card_id: 'c', category_id: 'k1' }],
    occurrences: [{ id: 'o1', card_id: 'c', date: '2026-11-09', instead_note: 'parque' }],
  });
  assert.equal(buscar('parque', dadosBusca, { categoria: 'k1' }).length, 1);
  assert.equal(buscar('parque', dadosBusca, { categoria: 'k2' }).length, 0);
});

test('"o que fiz no lugar" de bloco só é achado enquanto o bloco está não feito', () => {
  const bloco = (id, status) => ({ id, card_id: null, item_id: null, date: '2026-11-10', start_min: 600, title: 'x', status, instead_note: 'passeio' });
  const r = buscar('passeio', dados({ blocks: [bloco('b1', 'missed'), bloco('b2', 'done'), bloco('b3', 'planned')] }));
  assert.deepEqual(r.map((x) => x.bloco_id), ['b1']);
});

test('filtrar pela tag mãe acha card e bloco das subtags', () => {
  const categories = [{ id: 'm', name: 'Idiomas', parent_id: null }, { id: 'f', name: 'Vocabulário', parent_id: 'm' }];
  const r = buscar('verbo', dados({
    cards: [{ id: 'c1', title: 'Verbos irregulares' }, { id: 'c2', title: 'Verbo sem tag' }],
    card_categories: [{ card_id: 'c1', category_id: 'f' }],
    blocks: [{ id: 'b1', title: 'x', status: 'missed', instead_note: 'revisei verbos', category_id: 'f', date: '2026-11-16' }],
  }), { categoria: 'm', categories });
  assert.deepEqual(new Set(r.map((x) => x.card_id ?? x.bloco_id)), new Set(['c1', 'b1']));
});

test('filtrar pela subtag não acha card só da mãe', () => {
  const categories = [{ id: 'm', name: 'Idiomas', parent_id: null }, { id: 'f', name: 'Vocabulário', parent_id: 'm' }];
  const r = buscar('verbo', dados({
    cards: [{ id: 'c1', title: 'Verbos da mãe' }],
    card_categories: [{ card_id: 'c1', category_id: 'm' }],
  }), { categoria: 'f', categories });
  assert.equal(r.length, 0);
});
