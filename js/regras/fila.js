import { somaDias, inicioDaSemana, diasDaSemana } from './datas.js';

export function proximoItem(cardId, items) {
  const doCard = items.filter((i) => i.card_id === cardId);
  const grupos = [...new Set(doCard.map((i) => i.group_name))];
  for (const grupo of grupos) {
    const pendentes = doCard
      .filter((i) => i.group_name === grupo && !i.done)
      .sort((a, b) => a.position - b.position);
    if (pendentes.length) return pendentes[0];
  }
  return null;
}

export function progresso(cardId, items) {
  const doCard = items.filter((i) => i.card_id === cardId);
  return { feitos: doCard.filter((i) => i.done).length, total: doCard.length };
}

const ehFixaAtiva = (c) => c.is_fixed && !c.archived;

export function ocorrenciasDaSemana(cards, segunda) {
  const dias = diasDaSemana(segunda);
  const saida = [];
  for (const c of cards) {
    if (!ehFixaAtiva(c)) continue;
    const criada = c.created_at ? c.created_at.slice(0, 10) : null;
    for (const d of [...(c.fixed_days || [])].sort((a, b) => a - b)) {
      if (criada && dias[d - 1] < criada) continue;
      saida.push({ card_id: c.id, date: dias[d - 1] });
    }
  }
  return saida;
}

const blocoDaOcorrencia = (b, oc) =>
  b.kind === 'study' && b.card_id === oc.card_id && b.fixed_date === oc.date;

export function estadoDaOcorrencia(oc, occurrences, blocks) {
  const linha = occurrences.find((o) => o.card_id === oc.card_id && o.date === oc.date);
  if (linha) {
    if (linha.status === 'done') return 'cumprida';
    if (linha.status === 'missed') return 'nao_feita';
    if (linha.status === 'carried') return 'levada';
  }
  const iguais = blocks.filter((b) => blocoDaOcorrencia(b, oc));
  if (iguais.some((b) => b.status === 'done')) return 'cumprida';
  if (iguais.some((b) => b.status === 'planned')) return 'agendada';
  return 'a_fazer';
}

const ultimoBloco = (blocos) =>
  blocos.reduce((a, b) => (!a || b.date > a.date || (b.date === a.date && b.start_min >= a.start_min) ? b : a), null);

export function paraEncaixar({ cards, items, lists, blocks, occurrences, hoje }) {
  const segunda = inicioDaSemana(hoje);
  const estudo = blocks.filter((b) => b.kind === 'study');
  const mesmoAlvo = (b, e) =>
    b.card_id === e.card_id && (b.item_id || null) === e.item_id && (b.fixed_date || null) === e.fixed_date;
  const entrada = (tipo, card_id, item_id, fixed_date) => ({ tipo, card_id, item_id, fixed_date, reagendar: false });
  const proximoId = (id) => proximoItem(id, items)?.id ?? null;
  const entradas = [];

  const fixas = cards.filter(ehFixaAtiva);
  const porId = new Map(cards.map((c) => [c.id, c]));

  const daSemana = ocorrenciasDaSemana(cards, segunda)
    .filter((oc) => estadoDaOcorrencia(oc, occurrences, blocks) === 'a_fazer');
  const levadas = occurrences
    .filter((o) => o.status === 'carried' && o.date < segunda && ehFixaAtiva(porId.get(o.card_id) || {}))
    .filter((o) => !estudo.some((b) => blocoDaOcorrencia(b, o)
      && (b.status === 'done' || (b.status === 'planned' && b.date >= hoje))))
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const oc of [...daSemana, ...levadas]) {
    entradas.push(entrada('fixa', oc.card_id, proximoId(oc.card_id), oc.date));
  }

  for (const c of fixas) {
    if ((c.fixed_days || []).length) continue;
    const temItens = items.some((i) => i.card_id === c.id);
    const prox = proximoId(c.id);
    if (temItens && !prox) continue;
    entradas.push(entrada('fixa', c.id, prox, null));
  }

  const ativas = new Set(lists.filter((l) => l.is_active).map((l) => l.id));
  const daFila = cards.filter((c) => !c.archived && !c.is_fixed && ativas.has(c.list_id));
  for (const c of daFila) {
    if (items.some((i) => i.card_id === c.id)) {
      const prox = proximoId(c.id);
      if (prox) entradas.push(entrada('trilha', c.id, prox, null));
    }
  }
  for (const c of daFila) {
    if (!items.some((i) => i.card_id === c.id)) entradas.push(entrada('avulso', c.id, null, null));
  }

  return entradas
    .filter((e) => !estudo.some((b) => b.status === 'planned' && b.date >= hoje && mesmoAlvo(b, e)))
    .map((e) => ({ ...e, reagendar: ultimoBloco(estudo.filter((b) => mesmoAlvo(b, e)))?.status === 'missed' }));
}

export function pendenciasDaVirada({ cards, occurrences, blocks, hoje, ultimaVirada }) {
  const semanaAtual = inicioDaSemana(hoje);
  const anterior = somaDias(semanaAtual, -7);
  const primeira = ultimaVirada ? inicioDaSemana(ultimaVirada) : anterior;
  const limiteDePergunta = somaDias(semanaAtual, -28);
  const perguntar = [];
  const fecharSozinho = [];
  for (let s = primeira; s < semanaAtual; s = somaDias(s, 7)) {
    for (const oc of ocorrenciasDaSemana(cards, s)) {
      const estado = estadoDaOcorrencia(oc, occurrences, blocks);
      if (estado !== 'a_fazer' && estado !== 'agendada') continue;
      (s >= limiteDePergunta ? perguntar : fecharSozinho).push(oc);
    }
  }
  return { perguntar, fecharSozinho };
}

export function efeitosDeEstado(bloco, novo, { cards, items }) {
  let marcarItem = null;
  if (bloco.item_id) {
    if (novo === 'done') marcarItem = { id: bloco.item_id, done: true };
    else if (bloco.status === 'done') marcarItem = { id: bloco.item_id, done: false };
  }
  let perguntarConcluirCard = false;
  if (novo === 'done' && bloco.kind === 'study' && bloco.card_id) {
    const c = cards.find((x) => x.id === bloco.card_id);
    perguntarConcluirCard = !!c && !c.is_fixed && !items.some((i) => i.card_id === c.id);
  }
  return { marcarItem, perguntarConcluirCard };
}

// Levadas há mais de 4 semanas (antes da segunda-feira de 4 semanas atrás) sem sessão cumprida:
// a virada as fecha como não feitas para a fila não acumular atrasos.
export function levadasVencidas({ occurrences, blocks, hoje }) {
  const limite = somaDias(inicioDaSemana(hoje), -28);
  return occurrences
    .filter((o) => o.status === 'carried' && o.date < limite)
    .filter((o) => !blocks.some((b) => blocoDaOcorrencia(b, o) && b.status === 'done'))
    .map((o) => ({ card_id: o.card_id, date: o.date }));
}
