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

// ---- Tag do card: uma tag e, se quiser, subtags dela.
// Com subtags marcadas, o card guarda só as subtags; sem subtag, guarda a própria tag.
// Card antigo com mais de uma família: a primeira na ordem das tags manda; as outras ficam em `outras`.
export function categoriaDoCard(categories, ids) {
  const doCard = new Set(ids);
  const ordem = emOrdem(categories, { incluir: doCard }).filter((c) => doCard.has(c.id));
  if (!ordem.length) return { tagId: null, subIds: [], outras: [] };
  const tagId = ordem[0].parent_id || ordem[0].id;
  const daTag = (c) => (c.parent_id || c.id) === tagId;
  return {
    tagId,
    subIds: ordem.filter((c) => daTag(c) && c.parent_id).map((c) => c.id),
    outras: ordem.filter((c) => !daTag(c)).map((c) => c.id),
  };
}

export function trocarTag(tagId) {
  return tagId ? [tagId] : [];
}

export function alternarSubtag(categories, ids, subId) {
  const mae = maeDe(categories, subId);
  if (!mae) return [...ids];
  const { tagId, subIds, outras } = categoriaDoCard(categories, ids);
  const atuais = tagId === mae.id ? subIds : [];
  const subs = atuais.includes(subId) ? atuais.filter((x) => x !== subId) : [...atuais, subId];
  const resto = tagId === mae.id ? outras : ids.filter((x) => x !== mae.id);
  return [...resto, ...(subs.length ? subs : [mae.id])];
}
