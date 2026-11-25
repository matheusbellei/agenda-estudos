// Revisão espaçada dos cards: datas fixas marcadas pelo botão "Agendar revisão"; as vencidas entram na fila.
import { somaDias } from './datas.js';

const MAX = 6;
const ERRO_DIAS = 'Use de 1 a 6 números de 1 a 365, do menor para o maior, sem repetir (ex.: 7, 30).';

export function datasDoPadrao(hoje, dias) {
  return dias.map((d) => somaDias(hoje, d));
}

// Texto das Configurações ("7, 30") → lista de dias.
export function validarDias(texto) {
  const partes = String(texto).split(',').map((p) => p.trim()).filter((p) => p !== '');
  if (!partes.length || partes.length > MAX || !partes.every((p) => /^\d+$/.test(p))) return { erro: ERRO_DIAS };
  const dias = partes.map(Number);
  const ok = dias.every((d, i) => d >= 1 && d <= 365 && (i === 0 || d > dias[i - 1]));
  return ok ? { dias } : { erro: ERRO_DIAS };
}

export function validarDatas(datas, hoje) {
  if (!datas.length) return 'Escolha pelo menos uma data.';
  if (datas.some((d) => !d)) return 'Preencha todas as datas.';
  if (datas.length > MAX) return 'No máximo 6 revisões por vez.';
  if (datas.some((d) => d < hoje)) return 'As datas precisam ser de hoje em diante.';
  if (new Set(datas).size !== datas.length) return 'Há datas repetidas.';
  return null;
}

// Revisões pendentes que já venceram, de cards que existem e não estão arquivados, sem sessão marcada de hoje em diante.
export function revisoesParaEncaixar({ revisoes, cards, blocks, hoje }) {
  const porCard = new Map(cards.map((c) => [c.id, c]));
  const daRevisao = (r) => blocks.filter((b) => b.revisao_id === r.id && !b.cancelled);
  return revisoes
    .filter((r) => r.status === 'pendente' && r.data <= hoje)
    .filter((r) => porCard.has(r.card_id) && !porCard.get(r.card_id).archived)
    .filter((r) => !daRevisao(r).some((b) => b.status === 'planned' && b.date >= hoje))
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((r) => {
      const ultimo = daRevisao(r).sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date.localeCompare(b.date))).pop();
      return { tipo: 'revisao', card_id: r.card_id, item_id: null, fixed_date: null, revisao_id: r.id, data: r.data, reagendar: ultimo?.status === 'missed' };
    });
}

// Mudança de estado num bloco de revisão → novo estado da revisão (null = não muda).
export function statusDaRevisao(bloco, novo) {
  if (!bloco.revisao_id) return null;
  if (novo === 'done') return 'feita';
  return bloco.status === 'done' ? 'pendente' : null;
}

const dm = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

export function textoDasRevisoes(revisoes, cardId) {
  const doCard = revisoes.filter((r) => r.card_id === cardId && r.status !== 'cancelada').sort((a, b) => a.data.localeCompare(b.data));
  if (!doCard.length) return null;
  return `Revisões: ${doCard.map((r) => (r.status === 'feita' ? `${dm(r.data)} ✓` : dm(r.data))).join(' · ')}`;
}

// "Daqui a 7 e 30 dias (1/12 e 24/12)": o padrão explicado na janela de revisões.
const diaMes = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
const emLista = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);
export function textoDoPadrao(dias, datas) {
  const unidade = dias.length === 1 && dias[0] === 1 ? 'dia' : 'dias';
  return `Daqui a ${emLista(dias.map(String))} ${unidade} (${emLista(datas.map(diaMes))})`;
}
