// Busca em cards, itens e histórico "o que fiz no lugar" (blocos e ocorrências de fixas). Funções puras sobre os dados em memória.

const MARGEM = 60;
const POR_CARD_E_CAMPO = 3;
const ORDEM_CAMPOS = ['titulo', 'item', 'notas', 'notas_item', 'no_lugar'];

// Minúsculas e sem acentos, caractere a caractere: o tamanho do texto não muda,
// então um índice no texto normalizado vale também no texto original.
export function normalizar(texto) {
  let saida = '';
  // Composto (NFC) primeiro: texto colado do Trello ou do macOS pode vir com a letra e o acento separados.
  for (const c of String(texto ?? '').normalize('NFC')) {
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    saida += n.length === c.length ? n : c;
  }
  return saida;
}

// Texto de anotação sem os sinais de Markdown, em uma linha só (para mostrar e para buscar).
function textoPlano(md) {
  return String(md ?? '').normalize('NFC')
    .split('\n')
    .map((linha) => linha
      .replace(/^\s*(?:>\s*)+/, '')
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, ''))
    .join(' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Só marcas em par somem; `2*3` ou `window.__x` ficam como estão. A marca não pode colar em letra/dígito por fora.
    .replace(/(`+)(.+?)\1/g, '$2')
    .replace(/(^|[^\p{L}\p{N}*])(\*{1,3})(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}*])/gu, '$1$3')
    .replace(/(^|[^\p{L}\p{N}~])(~~)(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}~])/gu, '$1$3')
    .replace(/(^|[^\p{L}\p{N}_])(_{1,3})(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}_])/gu, '$1$3')
    .replace(/\s+/g, ' ')
    .trim();
}

function achados(plano, palavras) {
  const norm = normalizar(plano);
  const primeiras = palavras.map((p) => norm.indexOf(p));
  if (primeiras.some((i) => i < 0)) return [];
  // O trecho se ancora na palavra que aparece primeiro no campo.
  const ancora = palavras[primeiras.indexOf(Math.min(...primeiras))];
  const lista = [];
  for (let i = norm.indexOf(ancora); i >= 0 && lista.length < POR_CARD_E_CAMPO; i = norm.indexOf(ancora, i + ancora.length)) {
    const ini = Math.max(0, i - MARGEM);
    const fimTrecho = Math.min(plano.length, i + ancora.length + MARGEM);
    lista.push({
      trecho: plano.slice(ini, fimTrecho), inicio: i - ini, fim: i - ini + ancora.length,
      cortado_antes: ini > 0, cortado_depois: fimTrecho < plano.length,
    });
  }
  return lista;
}

// `categoria` filtra pela tag e, se for uma tag mãe, também pelas subtags dela (`categories` monta a família).
export function buscar(termo, { cards = [], items = [], blocks = [], occurrences = [], card_categories = [] }, { categoria, categories = [] } = {}) {
  const palavras = normalizar(termo).trim().split(/\s+/).filter(Boolean);
  if (normalizar(termo).trim().length < 2) return [];

  const cardPorId = new Map(cards.map((c) => [c.id, c]));
  const aceitas = categoria ? new Set([categoria, ...categories.filter((c) => c.parent_id === categoria).map((c) => c.id)]) : null;
  const passa = (cardId, bloco) => !aceitas
    || card_categories.some((cc) => cc.card_id === cardId && aceitas.has(cc.category_id))
    || (bloco && aceitas.has(bloco.category_id));

  const saida = [];
  const contagem = new Map();
  const juntar = (campo, cardId, itemId, blocoId, texto, ehMarkdown, extra = {}) => {
    const chave = `${cardId ?? blocoId}|${campo}`; // bloco de card excluído conta por conta própria
    const ja = contagem.get(chave) || 0;
    if (ja >= POR_CARD_E_CAMPO) return;
    const plano = ehMarkdown ? textoPlano(texto) : String(texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
    for (const a of achados(plano, palavras).slice(0, POR_CARD_E_CAMPO - ja)) {
      saida.push({ card_id: cardId, item_id: itemId, bloco_id: blocoId, campo, ...extra, ...a });
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
  };

  for (const c of cards) if (passa(c.id)) juntar('titulo', c.id, null, null, c.title, false);
  for (const i of items) {
    if (cardPorId.has(i.card_id) && passa(i.card_id)) juntar('item', i.card_id, i.id, null, i.title, false);
  }
  for (const c of cards) if (passa(c.id)) juntar('notas', c.id, null, null, c.notes, true);
  for (const i of items) {
    if (cardPorId.has(i.card_id) && passa(i.card_id)) juntar('notas_item', i.card_id, i.id, null, i.notes, true);
  }
  // Blocos e ocorrências de fixas dividem o limite por card: ficam os mais recentes.
  const historico = [
    ...blocks.map((b) => ({ data: String(b.date), hora: b.start_min ?? 0, bloco: b })),
    ...occurrences.map((o) => ({ data: String(o.date), hora: 0, ocorrencia: o })),
  ].sort((x, y) => y.data.localeCompare(x.data) || y.hora - x.hora);
  for (const h of historico) {
    if (h.bloco) {
      const b = h.bloco;
      // O texto fica gravado quando o bloco volta a cumprido ou planejado, mas só vale enquanto ele está não feito.
      if (b.status === 'missed' && passa(b.card_id, b)) juntar('no_lugar', b.card_id ?? null, b.item_id ?? null, b.id, b.instead_note, true);
    } else if (passa(h.ocorrencia.card_id)) {
      juntar('no_lugar', h.ocorrencia.card_id, null, null, h.ocorrencia.instead_note, true, { ocorrencia_data: h.data });
    }
  }

  const arquivado = (r) => Boolean(cardPorId.get(r.card_id)?.archived);
  const indice = new Map(saida.map((r, n) => [r, n]));
  return saida.sort((a, b) => ORDEM_CAMPOS.indexOf(a.campo) - ORDEM_CAMPOS.indexOf(b.campo)
    || arquivado(a) - arquivado(b) || indice.get(a) - indice.get(b));
}
