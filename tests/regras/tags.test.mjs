import test from 'node:test';
import assert from 'node:assert/strict';
import { maeDe, filhasDe, familia, nomeCompleto, nomeRepetido, podeSerMae, arvore, maesPrimeiro, emOrdem, categoriaDoCard, trocarTag, alternarSubtag } from '../../js/regras/tags.js';

const cats = [
  { id: 'id', name: 'Idiomas', parent_id: null, archived: false },
  { id: 'vo', name: 'Vocabulário', parent_id: 'id', archived: false },
  { id: 'gr', name: 'Gramática', parent_id: 'id', archived: false },
  { id: 'ar', name: 'Antiga', parent_id: 'id', archived: true },
  { id: 'ex', name: 'Exatas', parent_id: null, archived: false },
  { id: 've', name: 'Velha', parent_id: null, archived: true },
];

test('maeDe: subtag devolve a mãe; tag devolve null', () => {
  assert.equal(maeDe(cats, 'vo').id, 'id');
  assert.equal(maeDe(cats, 'id'), null);
});

test('filhasDe: ordem alfabética, sem arquivadas por padrão', () => {
  assert.deepEqual(filhasDe(cats, 'id').map((c) => c.id), ['gr', 'vo']);
  assert.deepEqual(filhasDe(cats, 'id', { incluirArquivadas: true }).map((c) => c.id), ['ar', 'gr', 'vo']);
});

test('familia: a própria tag e todas as filhas, arquivadas inclusive', () => {
  assert.deepEqual([...familia(cats, 'id')].sort(), ['ar', 'gr', 'id', 'vo']);
  assert.deepEqual([...familia(cats, 'vo')], ['vo']);
});

test('nomeCompleto: "Mãe › Filha" para subtag e só o nome para tag', () => {
  assert.equal(nomeCompleto(cats, cats[1]), 'Idiomas › Vocabulário');
  assert.equal(nomeCompleto(cats, cats[0]), 'Idiomas');
});

test('nomeRepetido: só entre irmãs, sem diferenciar maiúsculas e acentos', () => {
  assert.equal(nomeRepetido(cats, 'gramatica', 'id'), true);
  assert.equal(nomeRepetido(cats, 'Gramática', 'ex'), false);
  assert.equal(nomeRepetido(cats, ' idiomas ', null), true);
  assert.equal(nomeRepetido(cats, 'Vocabulário', null), false);
  assert.equal(nomeRepetido(cats, 'Gramática', 'id', 'gr'), false);
});

test('podeSerMae: só tag de primeiro nível', () => {
  assert.equal(podeSerMae(cats, 'id'), true);
  assert.equal(podeSerMae(cats, 'vo'), false);
});

test('arvore: tags de primeiro nível em ordem, com filhas, sem arquivadas', () => {
  const r = arvore(cats);
  assert.deepEqual(r.map((g) => g.tag.id), ['ex', 'id']);
  assert.deepEqual(r[1].filhas.map((c) => c.id), ['gr', 'vo']);
  assert.deepEqual(arvore(cats, { incluirArquivadas: true }).map((g) => g.tag.id), ['ex', 'id', 've']);
});

test('maesPrimeiro: na restauração a mãe vai antes da subtag, mesmo listada depois; sem parent_id conta como mãe', () => {
  const r = maesPrimeiro([{ id: 'f', parent_id: 'm' }, { id: 'velha' }, { id: 'm', parent_id: null }]);
  assert.deepEqual(r.map((c) => c.id), ['velha', 'm', 'f']);
});

test('emOrdem: mãe seguida das subtags; arquivadas só se pedidas, e subtag pedida aparece mesmo com a mãe arquivada', () => {
  assert.deepEqual(emOrdem(cats).map((c) => c.id), ['ex', 'id', 'gr', 'vo']);
  assert.deepEqual(emOrdem(cats, { incluir: new Set(['ar']) }).map((c) => c.id), ['ex', 'id', 'ar', 'gr', 'vo']);
  const maeArquivada = cats.map((c) => (c.id === 'id' ? { ...c, archived: true } : c));
  assert.deepEqual(emOrdem(maeArquivada, { incluir: new Set(['vo']) }).map((c) => c.id), ['ex', 'vo']);
});

// ---- tag do card: uma tag e subtags dela
const doCard = [...cats, { id: 'ca', name: 'Cálculo', parent_id: 'ex', archived: false }];

test('categoriaDoCard: vazio, só a tag, subtags e a família arquivada que o card usa', () => {
  assert.deepEqual(categoriaDoCard(doCard, []), { tagId: null, subIds: [], outras: [] });
  assert.deepEqual(categoriaDoCard(doCard, ['id']), { tagId: 'id', subIds: [], outras: [] });
  assert.deepEqual(categoriaDoCard(doCard, ['vo', 'gr']), { tagId: 'id', subIds: ['gr', 'vo'], outras: [] });
  assert.deepEqual(categoriaDoCard(doCard, ['ar']), { tagId: 'id', subIds: ['ar'], outras: [] });
});

test('categoriaDoCard: duas famílias — a primeira na ordem das tags manda, a outra vai para "outras"', () => {
  // Exatas vem antes de Idiomas.
  assert.deepEqual(categoriaDoCard(doCard, ['vo', 'ca']), { tagId: 'ex', subIds: ['ca'], outras: ['vo'] });
});

test('trocarTag: a tag sozinha, ou nada', () => {
  assert.deepEqual(trocarTag('ex'), ['ex']);
  assert.deepEqual(trocarTag(null), []);
});

test('alternarSubtag: marca, desmarca e volta para a tag quando não sobra subtag', () => {
  assert.deepEqual(alternarSubtag(doCard, ['id'], 'vo'), ['vo']);
  assert.deepEqual(alternarSubtag(doCard, ['vo'], 'gr').sort(), ['gr', 'vo']);
  assert.deepEqual(alternarSubtag(doCard, ['vo'], 'vo'), ['id']);
});

test('alternarSubtag: mantém a outra família de um card antigo', () => {
  assert.deepEqual(alternarSubtag(doCard, ['vo', 'ca'], 'ca').sort(), ['ex', 'vo']);
  assert.deepEqual(alternarSubtag(doCard, ['ex', 'vo'], 'ca').sort(), ['ca', 'vo']);
});
