// Arquivo do Quadro no estilo do Trello: cards arquivados em grupos por quando foram arquivados.
import { normalizar } from './busca.js';

export const GRUPOS_DO_ARQUIVO = ['Nos últimos 7 dias', 'Há mais de 7 dias', 'Há mais de 14 dias', 'Há mais de 30 dias', 'Sem data'];
const DIA = 86400000;

export function grupoDoArquivo(archivedAt, agoraMs) {
  const t = archivedAt ? Date.parse(archivedAt) : NaN;
  if (!Number.isFinite(t)) return 'Sem data';
  const dias = Math.floor((agoraMs - t) / DIA);
  if (dias <= 7) return GRUPOS_DO_ARQUIVO[0];
  if (dias <= 14) return GRUPOS_DO_ARQUIVO[1];
  if (dias <= 30) return GRUPOS_DO_ARQUIVO[2];
  return GRUPOS_DO_ARQUIVO[3];
}

// Grupos na ordem fixa (vazios ficam de fora); dentro, o arquivado mais recente primeiro; sem data, por título.
export function arquivoAgrupado(cards, { busca = '', agoraMs = Date.now() } = {}) {
  const alvo = normalizar(busca).trim();
  const achados = cards.filter((c) => !alvo || normalizar(c.title).includes(alvo));
  return GRUPOS_DO_ARQUIVO.map((titulo) => ({
    titulo,
    cards: achados.filter((c) => grupoDoArquivo(c.archived_at, agoraMs) === titulo)
      .sort((a, b) => (titulo === 'Sem data'
        ? a.title.localeCompare(b.title, 'pt-BR')
        : String(b.archived_at).localeCompare(String(a.archived_at)))),
  })).filter((g) => g.cards.length);
}
