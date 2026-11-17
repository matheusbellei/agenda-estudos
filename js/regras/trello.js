// Converte o JSON exportado do Trello em linhas do app. Função pura: sem DOM e sem relógio.
const COR_PADRAO = '#6F4E37';
const CORES = {
  red: '#B5543A', red_light: '#C97B63', purple: '#7A5C8A', blue: '#4A6C8C', lime: '#5B7A3A', green: '#5B7A3A',
  yellow: '#C9A227', orange: '#C68B59', sky: '#6FA3B8', pink: '#B86F8F', black: '#3B2416',
};
const DIAS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const TODOS_OS_DIAS = [1, 2, 3, 4, 5, 6, 7];
const MSG_INVALIDO = 'Este arquivo não parece ser um quadro exportado do Trello.';

export function corDaEtiqueta(cor) {
  return CORES[cor] || COR_PADRAO;
}

export function diasDaRegra(regra) {
  if (typeof regra !== 'string') return [];
  const byday = /BYDAY=([A-Z,]+)/.exec(regra);
  if (byday) {
    const dias = byday[1].split(',').map((d) => DIAS[d.slice(-2)]).filter(Boolean);
    return [...new Set(dias)].sort((a, b) => a - b);
  }
  const freq = /FREQ=(\w+)/.exec(regra)?.[1];
  if (freq === 'DAILY') return [...TODOS_OS_DIAS];
  if (freq === 'WEEKLY') {
    const inicio = /DTSTART[^:\n]*:(\d{4})(\d{2})(\d{2})/.exec(regra);
    if (!inicio) return [];
    const dia = new Date(Date.UTC(Number(inicio[1]), Number(inicio[2]) - 1, Number(inicio[3]))).getUTCDay();
    return [dia === 0 ? 7 : dia];
  }
  return [];
}

// Os 8 primeiros caracteres hexadecimais do id são os segundos desde 1970.
function criadoEm(id) {
  if (!/^[0-9a-f]{8}/i.test(id || '')) return null;
  return new Date(parseInt(id.slice(0, 8), 16) * 1000).toISOString();
}

const doisDigitos = (n) => String(n).padStart(2, '0');

function dataBR(iso) {
  const d = new Date(iso);
  return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const ids = (linhas) => new Set((linhas || []).map((l) => l.trello_id).filter(Boolean));

export function planoDeImportacao(json, existentes = {}) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.cards) || !Array.isArray(json.lists)) {
    throw new Error(MSG_INVALIDO);
  }
  const jaTem = {
    categories: ids(existentes.categories), lists: ids(existentes.lists), cards: ids(existentes.cards),
    items: ids(existentes.items), attachments: ids(existentes.attachments),
  };
  const plano = { categories: [], lists: [], cards: [], items: [], attachments: [], cardCategories: [] };
  let jaExistiam = 0;

  // ---- categorias (etiquetas)
  const etiquetas = new Set();
  for (const e of json.labels || []) {
    etiquetas.add(e.id);
    if (jaTem.categories.has(e.id)) continue;
    plano.categories.push({ trello_id: e.id, name: e.name || e.color || 'Sem nome', color: corDaEtiqueta(e.color), archived: false });
  }

  // ---- listas: só as abertas, "Fixas" não vira lista
  const listaFixas = json.lists.find((l) => !l.closed && l.name === 'Fixas');
  const abertas = json.lists.filter((l) => !l.closed && l !== listaFixas).sort((a, b) => a.pos - b.pos);
  // O banco aceita só uma lista ativa e uma de conclusão: se o app já tem a sua, ela continua valendo.
  const jaMarcada = (marca) => (existentes.lists || []).some((l) => l[marca]);
  const ativa = jaMarcada('is_active') ? null : abertas.find((l) => l.name === 'Em andamento');
  const concluida = jaMarcada('is_done') ? null : abertas.find((l) => l.name === 'Concluído');
  const idsAbertas = new Set(abertas.map((l) => l.id));
  for (const l of abertas) {
    if (jaTem.lists.has(l.id)) continue;
    plano.lists.push({ trello_id: l.id, name: l.name, position: l.pos, is_active: l === ativa, is_done: l === concluida });
  }

  // ---- comentários por card, do mais antigo ao mais novo
  const comentarios = new Map();
  const acoes = (json.actions || []).filter((a) => a.type === 'commentCard' && a.data?.card?.id && a.data.text)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const a of acoes) {
    if (!comentarios.has(a.data.card.id)) comentarios.set(a.data.card.id, []);
    comentarios.get(a.data.card.id).push(`Comentário de ${dataBR(a.date)}: ${a.data.text}`);
  }

  // ---- cards, anexos e vínculos com categorias
  const pendentes = [];
  const cardsDoPlano = new Set();
  for (const c of json.cards) {
    if (jaTem.cards.has(c.id)) { jaExistiam += 1; continue; }
    cardsDoPlano.add(c.id);
    const fixa = Boolean(listaFixas) && c.idList === listaFixas.id;
    // Card sem lista aberta (lista fechada ou inexistente) só pode entrar arquivado.
    const semLista = !fixa && !idsAbertas.has(c.idList);
    const desc = c.desc || '';
    const extra = (comentarios.get(c.id) || []).map((t) => `\n\n---\n${t}`).join('');
    const linha = {
      trello_id: c.id,
      title: c.name,
      list_trello_id: fixa || semLista ? null : c.idList,
      position: c.pos,
      notes: desc ? desc + extra : extra.replace(/^\n+/, ''),
      archived: Boolean(c.closed) || semLista,
      completed_at: c.dueComplete && c.due ? c.due : null,
      is_fixed: fixa,
      fixed_days: fixa ? diasDaRegra(c.recurrenceRule?.rule) : [],
    };
    const criado = criadoEm(c.id);
    if (criado) linha.created_at = criado;
    plano.cards.push(linha);
    for (const idEtiqueta of c.idLabels || []) {
      if (etiquetas.has(idEtiqueta)) plano.cardCategories.push({ card_trello_id: c.id, category_trello_id: idEtiqueta });
    }
    for (const a of c.attachments || []) {
      if (jaTem.attachments.has(a.id)) continue;
      const arquivo = a.fileName || a.name;
      if (a.isUpload) {
        plano.attachments.push({ trello_id: a.id, card_trello_id: c.id, kind: 'pending', name: arquivo, path: null, url: null });
        pendentes.push({ card: c.name, arquivo });
      } else {
        plano.attachments.push({ trello_id: a.id, card_trello_id: c.id, kind: 'link', name: a.name || a.url, path: null, url: a.url });
      }
    }
  }

  // ---- itens (checklists). Itens só entram junto com o card ou se o card já existir no banco.
  const cardsConhecidos = new Set([...cardsDoPlano, ...json.cards.filter((c) => jaTem.cards.has(c.id)).map((c) => c.id)]);
  const checklistsPorCard = new Map();
  for (const ck of [...(json.checklists || [])].sort((a, b) => a.pos - b.pos)) {
    if (!cardsConhecidos.has(ck.idCard)) continue;
    if (!checklistsPorCard.has(ck.idCard)) checklistsPorCard.set(ck.idCard, []);
    checklistsPorCard.get(ck.idCard).push(ck);
  }
  for (const [idCard, checklists] of checklistsPorCard) {
    // Várias checklists no mesmo card repetem as posições; renumera para manter os grupos em sequência.
    const renumerar = checklists.length > 1;
    let ordem = 0;
    for (const ck of checklists) {
      for (const it of [...(ck.checkItems || [])].sort((a, b) => a.pos - b.pos)) {
        ordem += 1;
        if (jaTem.items.has(it.id)) continue;
        plano.items.push({
          trello_id: it.id,
          card_trello_id: idCard,
          group_name: ck.name || '',
          title: String(it.name).replace(/\t+/g, ' '),
          position: renumerar ? ordem * 1024 : it.pos,
          done: it.state === 'complete',
        });
      }
    }
  }

  const novas = plano.cards;
  return {
    ...plano,
    resumo: {
      cards: novas.length,
      itens: plano.items.length,
      categorias: plano.categories.length,
      listas: plano.lists.length,
      fixas: novas.filter((c) => c.is_fixed).length,
      arquivados: novas.filter((c) => c.archived).length,
      pendentes,
      jaExistiam,
    },
  };
}
