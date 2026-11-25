// Tags (tabela categories) com subtags em dois níveis: a subtag aponta para a mãe por parent_id.
import { normalizar } from './busca.js';

const porNome = (a, b) => a.name.localeCompare(b.name, 'pt-BR');

export function maeDe(categories, id) {
  const c = categories.find((x) => x.id === id);
  return c?.parent_id ? categories.find((x) => x.id === c.parent_id) || null : null;
}

export function filhasDe(categories, id, { incluirArquivadas = false } = {}) {
  return categories.filter((c) => c.parent_id === id && (incluirArquivadas || !c.archived)).sort(porNome);
}

// A tag e as subtags dela (arquivadas inclusive): o que um filtro pela tag deve achar.
export function familia(categories, id) {
  return new Set([id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)]);
}

export function nomeCompleto(categories, categoria) {
  const mae = categoria.parent_id ? categories.find((x) => x.id === categoria.parent_id) : null;
  return mae ? `${mae.name} › ${categoria.name}` : categoria.name;
}

// Nome igual (sem diferenciar maiúsculas e acentos) só é proibido entre irmãs: mesma mãe, ou duas tags de primeiro nível.
export function nomeRepetido(categories, nome, parentId, excetoId = null) {
  const alvo = normalizar(nome).trim();
  return categories.some((c) => c.id !== excetoId && (c.parent_id || null) === (parentId || null)
    && normalizar(c.name).trim() === alvo);
}

export function podeSerMae(categories, id) {
  const c = categories.find((x) => x.id === id);
  return Boolean(c) && !c.parent_id;
}

export function arvore(categories, { incluirArquivadas = false } = {}) {
  return categories.filter((c) => !c.parent_id && (incluirArquivadas || !c.archived)).sort(porNome)
    .map((tag) => ({ tag, filhas: filhasDe(categories, tag.id, { incluirArquivadas }) }));
}

// Ordem de gravação na restauração do backup: tags de primeiro nível antes das subtags (o banco exige a mãe antes).
export function maesPrimeiro(categories) {
  return [...categories.filter((c) => !c.parent_id), ...categories.filter((c) => c.parent_id)];
}

// Ordem de exibição em listas e seletores: cada tag seguida das suas subtags. Arquivadas ficam de fora,
// salvo as de `incluir` (ex.: as que um card já usa). Subtag de mãe escondida só aparece se estiver em `incluir` (vai para o fim).
export function emOrdem(categories, { incluir = new Set() } = {}) {
  const ve = (c) => !c.archived || incluir.has(c.id);
  const maes = categories.filter((c) => !c.parent_id && ve(c)).sort(porNome);
  const saida = [];
  for (const m of maes) saida.push(m, ...categories.filter((c) => c.parent_id === m.id && ve(c)).sort(porNome));
  const ja = new Set(saida.map((c) => c.id));
  saida.push(...categories.filter((c) => c.parent_id && incluir.has(c.id) && !ja.has(c.id)).sort(porNome));
  return saida;
}

// ---- Tag do card: uma tag e, se quiser, uma subtag dela.
// O card guarda a subtag (se houver) ou a tag. Card antigo com várias subtags ou famílias: a primeira na ordem
// das tags manda; o resto fica em `outras` até a próxima escolha.
const tagDe = (categories, id) => {
  const c = categories.find((x) => x.id === id);
  return c ? c.parent_id || c.id : null;
};

export function categoriaDoCard(categories, ids) {
  const doCard = new Set(ids);
  const ordem = emOrdem(categories, { incluir: doCard }).filter((c) => doCard.has(c.id));
  if (!ordem.length) return { tagId: null, subId: null, outras: [] };
  const tagId = ordem[0].parent_id || ordem[0].id;
  const subId = ordem.find((c) => c.parent_id === tagId)?.id || null;
  return { tagId, subId, outras: ordem.filter((c) => c.id !== tagId && c.id !== subId).map((c) => c.id) };
}

export function trocarTag(tagId) {
  return tagId ? [tagId] : [];
}

// Escolher a subtag (ou "Nenhuma" = null) deixa só ela na família; as outras famílias de um card antigo ficam.
export function escolherSubtag(categories, ids, subId) {
  const tagId = subId ? tagDe(categories, subId) : categoriaDoCard(categories, ids).tagId;
  if (!tagId) return [...ids];
  return [...ids.filter((id) => tagDe(categories, id) !== tagId), subId || tagId];
}

// O que vai para a tag do bloco criado a partir do card.
export function categoriaParaBloco(categories, ids) {
  const { tagId, subId } = categoriaDoCard(categories, ids);
  return subId || tagId || null;
}
