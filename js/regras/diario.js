// Diário de estudo: os textos gravados nos blocos, para o card, a tela Diário e a busca.
import { normalizar } from './busca.js';

// Mais novo primeiro. `tagId` de uma tag mãe inclui as subtags; `termo` ignora acentos e maiúsculas.
export function registrosDoDiario({ blocks = [], cards = [], items = [], categories = [] }, { cardId, tagId, termo } = {}) {
  const cardPorId = new Map(cards.map((c) => [c.id, c]));
  const itemPorId = new Map(items.map((i) => [i.id, i]));
  const tags = tagId ? new Set([tagId, ...categories.filter((c) => c.parent_id === tagId).map((c) => c.id)]) : null;
  const palavras = normalizar(termo || '').trim().split(/\s+/).filter(Boolean);
  return blocks
    .filter((b) => !b.cancelled && (b.diario || '').trim())
    .filter((b) => !cardId || b.card_id === cardId)
    .filter((b) => !tags || tags.has(b.category_id))
    .filter((b) => { const t = normalizar(b.diario); return palavras.every((p) => t.includes(p)); })
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : y.start_min - x.start_min))
    .map((b) => ({ bloco: b, texto: b.diario.trim(), card: cardPorId.get(b.card_id) || null, item: itemPorId.get(b.item_id) || null }));
}
