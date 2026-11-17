// Fila "Para encaixar": desenho, seleção por toque, arrasto e criação do bloco de estudo.
// A seleção é única e vale para as telas Semana e Hoje (só uma delas aparece por vez).
import { criar } from './bloco.js';
import { itensOrdenados } from './quadro.js';
import { paraEncaixar, progresso } from '../regras/fila.js';
import { DIAS_CURTOS, diaDaSemana } from '../regras/datas.js';

const HEX = /^#[0-9a-f]{6}$/i;
const chave = (e) => `${e.card_id}|${e.item_id || ''}|${e.fixed_date || ''}`;

let selecao = null;
let barra = null;
let ultima = null; // última chamada de montarFila, para refazer quando um arrasto termina
let arrastando = false;
let bloquearClique = false;

export const selecaoAtual = () => selecao;

// Itens vão sempre ordenados por position: as regras da fila dependem dessa ordem.
export const entradasDaFila = (estado, hoje) => paraEncaixar({
  cards: estado.dados.cards, items: itensOrdenados(estado), lists: estado.dados.lists,
  blocks: estado.dados.blocks, occurrences: estado.dados.occurrences, hoje,
});

// Uma hora a partir de `ini`, sem entrar em bloco já marcado nem passar do fim do período.
export function umaHoraLivre(ini, blocosDoDia, fim) {
  // Blocos colados: repete até sair de todos (cada volta avança, então termina).
  let start = ini;
  for (let dentro = blocosDoDia.find((b) => b.start_min <= start && b.end_min > start); dentro;
    dentro = blocosDoDia.find((b) => b.start_min <= start && b.end_min > start)) start = dentro.end_min;
  const proximo = blocosDoDia.filter((b) => b.start_min > start).reduce((m, b) => Math.min(m, b.start_min), Infinity);
  const end = Math.min(start + 60, proximo, fim, 1440);
  return end > start ? { start_min: start, end_min: end } : null;
}

function garantirBarra() {
  if (barra) return barra;
  const cancelar = criar('button', { type: 'button', class: 'btn', id: 'escolha-cancelar', texto: 'Cancelar' });
  cancelar.addEventListener('click', () => escolher(null));
  barra = criar('div', { id: 'escolha-faixa', class: 'escolha-faixa', role: 'status', hidden: '' },
    criar('div', { class: 'escolha-linha' }, criar('span', { class: 'escolha-texto' }), cancelar),
    criar('div', { class: 'erro', id: 'escolha-erro', role: 'alert' }));
  document.body.append(barra);
  return barra;
}

function escolher(entrada, estado) {
  selecao = entrada;
  const b = garantirBarra();
  document.body.classList.toggle('escolhendo-horario', Boolean(entrada));
  b.hidden = !entrada;
  b.querySelector('#escolha-erro').textContent = '';
  if (entrada) {
    const card = estado.dados.cards.find((c) => c.id === entrada.card_id);
    b.querySelector('.escolha-texto').textContent = `Escolha um horário · ${card?.title || ''}`;
  }
  document.querySelectorAll('.fila-item').forEach((el) => {
    const ligado = Boolean(entrada) && el.dataset.chave === chave(entrada);
    el.classList.toggle('selecionado', ligado);
    el.setAttribute('aria-pressed', String(ligado));
  });
}

// Recado na faixa de escolha, mantendo o item selecionado.
export function avisarSelecao(mensagem) {
  garantirBarra().querySelector('#escolha-erro').textContent = mensagem;
}

function mostrarErro(mensagem) {
  const b = garantirBarra();
  b.hidden = false;
  b.querySelector('.escolha-texto').textContent = 'Não foi possível agendar';
  b.querySelector('#escolha-erro').textContent = mensagem;
}

// Cria a sessão de estudo da entrada; se falhar, a seleção continua e o motivo aparece na faixa.
export async function agendarEntrada(estado, entrada, { date, start_min, end_min }) {
  const card = estado.dados.cards.find((c) => c.id === entrada.card_id);
  if (!card) return false;
  const item = entrada.item_id ? estado.dados.items.find((i) => i.id === entrada.item_id) : null;
  const ids = estado.dados.card_categories.filter((cc) => cc.card_id === card.id).map((cc) => cc.category_id);
  const categoria = estado.dados.categories.find((c) => ids.includes(c.id) && !c.archived);
  try {
    await estado.criar('blocks', {
      date, start_min, end_min, kind: 'study', title: item ? `${card.title} · ${item.title}` : card.title,
      category_id: categoria?.id || null, card_id: card.id, item_id: item?.id || null, fixed_date: entrada.fixed_date || null,
    });
  } catch (err) {
    mostrarErro(err.message || 'Não foi possível agendar.');
    return false;
  }
  if (selecao && chave(selecao) === chave(entrada)) escolher(null, estado);
  else if (barra) barra.hidden = true;
  return true;
}

// Toque numa área livre com um item da fila escolhido.
export const agendarSelecionada = (estado, quando) => (selecao ? agendarEntrada(estado, selecao, quando) : Promise.resolve(false));

document.addEventListener('touchmove', (e) => { if (arrastando) e.preventDefault(); }, { passive: false });

function comecarArrasto(el, x, y) {
  arrastando = true;
  const caixa = el.getBoundingClientRect();
  const dx = x - caixa.left;
  const dy = y - caixa.top;
  const fantasma = el.cloneNode(true);
  fantasma.classList.add('fila-fantasma');
  Object.assign(fantasma.style, { width: `${caixa.width}px`, left: `${caixa.left}px`, top: `${caixa.top}px` });
  document.body.append(fantasma);
  el.classList.add('arrastando');
  let ultimoY = y;
  // Perto da borda de cima ou de baixo a página rola, para alcançar o horário no celular.
  const rolagem = setInterval(() => {
    if (ultimoY < 70) window.scrollBy(0, -14);
    else if (ultimoY > window.innerHeight - 70) window.scrollBy(0, 14);
  }, 16);
  return {
    mover(px, py) {
      ultimoY = py;
      fantasma.style.left = `${px - dx}px`;
      fantasma.style.top = `${py - dy}px`;
    },
    terminar() {
      clearInterval(rolagem);
      fantasma.remove();
      el.classList.remove('arrastando');
      arrastando = false;
      bloquearClique = true;
      setTimeout(() => { bloquearClique = false; }, 0);
    },
  };
}

// Mouse: arrasta após 6 px. Toque: só depois de 300 ms parado (mexer antes é rolagem).
function ligarArrasto(el, entrada, aoSoltar) {
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let ult = { x: x0, y: y0 };
    let arrasto = null;
    let timer = null;
    const limpar = () => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', aoMover);
      document.removeEventListener('pointerup', aoSoltarPonteiro);
      document.removeEventListener('pointercancel', aoCancelar);
    };
    const iniciar = () => { arrasto = comecarArrasto(el, ult.x, ult.y); };
    function aoMover(ev) {
      ult = { x: ev.clientX, y: ev.clientY };
      if (!arrasto) {
        const d = Math.hypot(ult.x - x0, ult.y - y0);
        if (ev.pointerType === 'mouse') { if (d > 6) iniciar(); } else if (d > 10) { limpar(); return; }
        if (!arrasto) return;
      }
      arrasto.mover(ult.x, ult.y);
    }
    function fim(soltou) {
      limpar();
      if (!arrasto) return;
      arrasto.terminar();
      arrasto = null;
      if (soltou) aoSoltar?.(entrada, ult.x, ult.y);
      if (ultima) montarFila(ultima.el, ultima.opcoes);
    }
    function aoSoltarPonteiro() { fim(true); }
    function aoCancelar() { fim(false); }
    document.addEventListener('pointermove', aoMover);
    document.addEventListener('pointerup', aoSoltarPonteiro);
    document.addEventListener('pointercancel', aoCancelar);
    if (e.pointerType !== 'mouse') timer = setTimeout(iniciar, 300);
  });
}

function corDoCard(estado, cardId) {
  const ids = estado.dados.card_categories.filter((cc) => cc.card_id === cardId).map((cc) => cc.category_id);
  const c = estado.dados.categories.find((x) => ids.includes(x.id) && !x.archived && HEX.test(x.color));
  return c ? c.color : null;
}

function itemDaFila(estado, e) {
  const card = estado.dados.cards.find((c) => c.id === e.card_id);
  const item = e.item_id ? estado.dados.items.find((i) => i.id === e.item_id) : null;
  const sub = [];
  if (e.fixed_date) sub.push(`${DIAS_CURTOS[diaDaSemana(e.fixed_date) - 1]} ${e.fixed_date.slice(8)}/${e.fixed_date.slice(5, 7)}`);
  if (item) sub.push(item.title);
  const { feitos, total } = progresso(e.card_id, estado.dados.items);
  if (total) sub.push(`${feitos} de ${total}`);
  const el = criar('div', {
    class: `fila-item${selecao && chave(selecao) === chave(e) ? ' selecionado' : ''}`, role: 'button', tabindex: '0',
    'aria-pressed': String(Boolean(selecao && chave(selecao) === chave(e))),
    'data-card': e.card_id, 'data-item': e.item_id || '', 'data-fixa-data': e.fixed_date || '', 'data-chave': chave(e),
  },
  criar('div', { class: 'fila-topo' },
    criar('span', { class: 'fila-card', texto: card?.title || '' }),
    ...(e.reagendar ? [criar('span', { class: 'fila-etiqueta', texto: 'Reagendar' })] : [])),
  ...(sub.length ? [criar('div', { class: 'fila-sub', texto: sub.join(' · ') })] : []));
  const cor = corDoCard(estado, e.card_id);
  if (cor) el.style.setProperty('--cor-fila', cor);
  return el;
}

// Redesenhada pela Semana e pela Hoje junto com o calendário; não ouve o estado por conta própria.
export function montarFila(el, opcoes) {
  const { estado, hoje, aoSoltar } = opcoes;
  ultima = { el, opcoes };
  if (arrastando) return;
  const entradas = entradasDaFila(estado, hoje);
  if (selecao && !entradas.some((e) => chave(e) === chave(selecao))) escolher(null, estado);
  const itens = entradas.map((e) => {
    const item = itemDaFila(estado, e);
    const alternar = () => escolher(selecao && chave(selecao) === chave(e) ? null : e, estado);
    item.addEventListener('click', () => { if (!bloquearClique) alternar(); });
    item.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target === item) { ev.preventDefault(); alternar(); } });
    ligarArrasto(item, e, aoSoltar);
    return item;
  });
  el.replaceChildren(criar('h3', { texto: 'Para encaixar' }),
    ...(itens.length ? [criar('div', { class: 'fila-lista' }, ...itens)] : [criar('p', { class: 'suave', texto: 'Nada para encaixar agora.' })]));
}
