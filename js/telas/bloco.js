// Blocos do calendário: elemento visual, gravação e (mais abaixo) a folha de criar/editar.
import { corDoTexto } from './ajustes.js';
import { emOrdem, nomeCompleto } from '../regras/tags.js';
import { horaTexto, minutosDe, somaDias, diaDaSemana, DIAS_CURTOS } from '../regras/datas.js';
import { efeitosDeEstado } from '../regras/fila.js';
import { moverCard, cardsDaLista, posicaoNoFim } from './quadro.js';
import { registrarTextoNaoSalvo, pedirDescarte } from './folhas.js';

let estado = null;
let abrirCardFn = () => {};
let camada = null;
// Da folha aberta: se há texto digitado não salvo, e como fechar pelo fundo ou pelo Esc (perguntando antes).
let temTextoAberto = () => false;
let fecharPeloFundo = () => {};

function criar(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'class') el.className = v;
    else if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v);
  }
  el.append(...filhos);
  return el;
}

export function iniciarBloco({ estado: e, abrirCard }) {
  estado = e;
  abrirCardFn = abrirCard || abrirCardFn;
  camada = criar('div', { id: 'folha-bloco', class: 'menu-camada', hidden: '' });
  document.body.append(camada);
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !camada.hidden) fecharPeloFundo(); });
  registrarTextoNaoSalvo(() => !camada.hidden && temTextoAberto());
}

function fecharBloco() {
  camada.hidden = true;
  camada.replaceChildren();
  document.body.classList.remove('sem-rolagem');
}

const HEX = /^#[0-9a-f]{6}$/i;
const MARCAS = { done: '✓', missed: '✕' };
const MANTER_ABERTA = Symbol('manter-aberta');
const CLASSES = { planned: 'bloco-planejado', done: 'bloco-cumprido', missed: 'bloco-nao-feito' };

export const idDoBloco = (b) => (b.virtual ? `v:${b.commitment_id}:${b.date}` : b.id);

// Planejado usa a cor da categoria, só se for #RRGGBB; senão o estilo "sem categoria".
export function elementoBloco(bloco, { compacto = false } = {}) {
  const status = bloco.status || 'planned';
  const categoria = estado?.dados.categories.find((c) => c.id === bloco.category_id);
  const cor = categoria && HEX.test(categoria.color) ? categoria.color : null;
  const classes = ['bloco', CLASSES[status] || CLASSES.planned];
  if (compacto) classes.push('bloco-compacto');
  if (status === 'planned' && !cor) classes.push('bloco-sem-categoria');
  const el = criar('div', { class: classes.join(' '), 'data-bloco': idDoBloco(bloco), 'data-status': status, role: 'button', tabindex: '0' });
  if (status === 'planned' && cor) { el.style.background = cor; el.style.color = corDoTexto(cor.toUpperCase()); }
  const hora = compacto ? horaTexto(bloco.start_min) : `${horaTexto(bloco.start_min)}–${horaTexto(bloco.end_min)}`;
  el.append(
    ...(MARCAS[status] ? [criar('span', { class: 'bloco-marca', 'aria-hidden': 'true', texto: MARCAS[status] })] : []),
    criar('span', { class: 'bloco-cabeca' },
      criar('span', { class: 'bloco-hora', texto: hora }),
      criar('span', { class: 'bloco-titulo', texto: bloco.title || (bloco.kind === 'study' ? 'Estudo' : 'Compromisso') })),
  );
  // "O que fiz no lugar": texto abaixo do título no Hoje, só um ícone de nota na Semana.
  const nota = status === 'missed' ? (bloco.instead_note || '').trim() : '';
  if (nota) {
    if (compacto) el.append(criar('span', { class: 'bloco-nota', title: nota, 'aria-label': 'Tem anotação do que fiz no lugar', texto: '✎' }));
    else el.append(criar('span', { class: 'bloco-no-lugar', texto: nota }), criar('span', { class: 'bloco-nota', title: nota, 'aria-label': 'Tem anotação do que fiz no lugar', texto: '✎' }));
  }
  return el;
}

// Único caminho para mudar um bloco: ocorrência virtual vira linha em `blocks` com o patch aplicado.
export async function gravarBloco(est, bloco, patch) {
  // O tipo acompanha o card: com card é estudo, sem card é compromisso.
  const tipo = (linha) => ('card_id' in linha ? { kind: linha.card_id ? 'study' : 'commitment' } : {});
  if (bloco.virtual) {
    const linha = {
      commitment_id: bloco.commitment_id, date: bloco.date, start_min: bloco.start_min, end_min: bloco.end_min,
      card_id: bloco.card_id || null, title: bloco.title, category_id: bloco.category_id, status: 'planned', instead_note: '', ...patch,
    };
    return est.criar('blocks', { ...linha, ...tipo(linha) });
  }
  return est.alterar('blocks', bloco.id, { ...patch, ...tipo(patch) });
}

// Muda o estado do bloco e aplica o efeito no item. O item vai primeiro: se algo falhar, nunca sobra
// um bloco cumprido cujo item não foi marcado. Se o bloco falhar depois, o item volta como estava.
// Devolve o card a oferecer para concluir (só em transição real e se existir lista de conclusão).
export async function mudarEstado(est, bloco, novo, { instead_note = '' } = {}) {
  const atual = bloco.status || 'planned';
  if (bloco.virtual && novo === 'planned') return { concluirCard: null };
  let concluirCard = null;
  let desfazer = null;
  if (novo !== atual) {
    const { marcarItem, perguntarConcluirCard } = efeitosDeEstado(bloco, novo, { cards: est.dados.cards, items: est.dados.items });
    const antes = marcarItem && est.dados.items.find((i) => i.id === marcarItem.id);
    if (antes) {
      await est.alterar('items', antes.id, { done: marcarItem.done, done_at: marcarItem.done ? new Date().toISOString() : null });
      desfazer = () => est.alterar('items', antes.id, { done: antes.done, done_at: antes.done_at });
    }
    if (perguntarConcluirCard && est.dados.lists.some((l) => l.is_done)) concluirCard = est.dados.cards.find((c) => c.id === bloco.card_id) || null;
  }
  try {
    // O texto de "o que fiz no lugar" nunca é apagado por mudança de estado: só é regravado em "não feito".
    await gravarBloco(est, bloco, novo === 'missed' ? { status: novo, instead_note: instead_note.trim() } : { status: novo });
  } catch (err) {
    if (desfazer) {
      try { await desfazer(); } catch {
        throw new Error(novo === 'done'
          ? 'Não foi possível salvar o compromisso, e o item ficou marcado como feito no card. Desmarque-o no card.'
          : 'Não foi possível salvar o compromisso, e o item ficou desmarcado no card. Marque-o de novo no card.');
      }
    }
    throw err;
  }
  return { concluirCard };
}

// Move o card para a lista de conclusão (ele ganha `completed_at`).
export function concluirCard(est, card) {
  const lista = est.dados.lists.find((l) => l.is_done);
  if (!lista) throw new Error('Marque uma lista como de conclusão em Ajustes.');
  return moverCard(est, card, lista.id, posicaoNoFim(cardsDaLista(est, lista.id)));
}

export { criar };

// ---- folha de criar e editar

const semAcento = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// type="time" não representa 24:00: 23:59 no fim vale "até a meia-noite".
function lerHora(texto, ehFim = false) {
  if (!/^\d{2}:\d{2}$/.test(texto)) return null;
  const min = minutosDe(texto);
  return ehFim && min === 1439 ? 1440 : min;
}
const textoHora = (min) => (min >= 1440 ? '23:59' : horaTexto(min));

function campo(rotulo, input, extra = {}) {
  return criar('label', { class: 'campo', ...extra }, criar('span', { texto: rotulo }), input);
}

export function abrirBloco(arg) {
  const novo = Boolean(arg.novo);
  const regra = !novo && arg.commitment_id ? estado.dados.commitments.find((c) => c.id === arg.commitment_id) : null;
  let cardId = arg.card_id || null;
  let ocupado = false;
  let tituloAuto = '';
  const dias = new Set(regra ? regra.days : [diaDaSemana(arg.date)]);

  const titulo = criar('input', { id: 'bloco-titulo', type: 'text', autocomplete: 'off', maxlength: '120' });
  titulo.value = arg.title || '';
  const categoria = criar('select', { id: 'bloco-categoria' }, criar('option', { value: '', texto: 'Sem categoria' }));
  // Tag com subtags vira um grupo (a própria tag e as subtags); tag sem subtag fica solta.
  {
    const lista = emOrdem(estado.dados.categories, { incluir: new Set(arg.category_id ? [arg.category_id] : []) });
    const opcao = (c) => { const o = criar('option', { value: c.id }); o.textContent = c.name; return o; };
    for (const c of lista) {
      if (c.parent_id) continue;
      const filhas = lista.filter((x) => x.parent_id === c.id);
      if (!filhas.length) { categoria.append(opcao(c)); continue; }
      const grupo = criar('optgroup');
      grupo.label = c.name;
      grupo.append(opcao(c), ...filhas.map(opcao));
      categoria.append(grupo);
    }
    // Subtag cuja mãe está escondida (arquivada) e que este bloco usa.
    lista.filter((x) => x.parent_id && !lista.some((m) => m.id === x.parent_id))
      .forEach((x) => { const o = opcao(x); o.textContent = nomeCompleto(estado.dados.categories, x); categoria.append(o); });
  }
  categoria.value = arg.category_id || '';
  const data = criar('input', { id: 'bloco-data', type: 'date', value: arg.date });
  const inicio = criar('input', { id: 'bloco-inicio', type: 'time', value: textoHora(arg.start_min) });
  const fim = criar('input', { id: 'bloco-fim', type: 'time', value: textoHora(arg.end_min) });


  // estudo: card pela busca de título e, se houver, o item
  const busca = criar('input', { id: 'bloco-card-busca', type: 'search', placeholder: 'Buscar card pelo título', autocomplete: 'off' });
  const opcoes = criar('div', { id: 'bloco-card-opcoes', class: 'card-opcoes' });
  const escolhido = criar('div', { id: 'bloco-card-escolhido', class: 'card-escolhido' });
  const item = criar('select', { id: 'bloco-item' });
  const campoItem = campo('Item', item);
  // Card que nasce junto com o bloco (Configurações → "Bloco sem card": perguntar, sempre ou nunca).
  const ajustes = estado.ajustes();
  const listas = [...estado.dados.lists].sort((a, b) => a.position - b.position);
  const listaPadrao = listas.find((l) => l.id === ajustes.auto_card_list_id) || listas.find((l) => l.is_active) || listas[0] || null;
  const modoCard = listaPadrao ? ajustes.auto_card : 'nunca';
  const criarCard = criar('input', { id: 'bloco-criar-card', type: 'checkbox' });
  const novoCardTitulo = criar('input', { id: 'bloco-novo-card-titulo', type: 'text', maxlength: '200', autocomplete: 'off' });
  const novoCardLista = criar('select', { id: 'bloco-novo-card-lista' },
    ...listas.map((l) => { const o = criar('option', { value: l.id }); o.textContent = l.name; return o; }));
  if (listaPadrao) novoCardLista.value = listaPadrao.id;
  let novoCardTituloEditado = false;
  novoCardTitulo.addEventListener('input', () => { novoCardTituloEditado = true; });
  const detalhesNovoCard = criar('div', { class: 'bloco-novo-card-campos' }, campo('Título do card', novoCardTitulo), campo('Lista', novoCardLista));
  const caixaNovoCard = criar('div', { class: 'bloco-novo-card' },
    criar('label', { class: 'repetir' }, criarCard, criar('span', { texto: 'Criar card para este bloco' })), detalhesNovoCard);
  function atualizarNovoCard() {
    caixaNovoCard.hidden = !(novo && !cardId && modoCard === 'perguntar');
    detalhesNovoCard.hidden = !criarCard.checked;
    if (!novoCardTituloEditado) novoCardTitulo.value = titulo.value.trim();
  }
  criarCard.addEventListener('change', atualizarNovoCard);
  titulo.addEventListener('input', atualizarNovoCard);

  const tirar = criar('button', { type: 'button', class: 'btn', id: 'bloco-card-tirar', texto: 'Tirar card' });
  tirar.addEventListener('click', () => { cardId = null; mostrarEscolhido(); atualizarNovoCard(); });
  const caixaEstudo = criar('div', { class: 'bloco-estudo' }, campo('Card (opcional)', busca), opcoes, escolhido, campoItem, caixaNovoCard);

  function mostrarEscolhido() {
    const card = estado.dados.cards.find((c) => c.id === cardId);
    escolhido.replaceChildren();
    escolhido.hidden = !card;
    campoItem.hidden = true;
    if (!card) return;
    const abrir = criar('button', { type: 'button', class: 'btn', id: 'bloco-card-abrir', texto: 'Abrir card' });
    abrir.addEventListener('click', () => { fecharBloco(); abrirCardFn(card.id); });
    escolhido.append(criar('span', { class: 'card-escolhido-nome', texto: card.title }), abrir, tirar);
    const itens = estado.dados.items.filter((i) => i.card_id === card.id).sort((a, b) => a.position - b.position);
    if (!itens.length) return;
    item.replaceChildren(criar('option', { value: '', texto: 'Sem item específico' }));
    itens.forEach((i) => { const o = criar('option', { value: i.id }); o.textContent = `${i.group_name ? `${i.group_name} — ` : ''}${i.title}${i.done ? ' (feito)' : ''}`; item.append(o); });
    item.value = itens.some((i) => i.id === arg.item_id) && card.id === arg.card_id ? arg.item_id : '';
    campoItem.hidden = false;
  }

  // "Card · Item": o título que o bloco de estudo leva quando o usuário não escreveu outro.
  function sugestao() {
    const card = estado.dados.cards.find((c) => c.id === cardId);
    if (!card) return '';
    const it = item.value && !campoItem.hidden ? estado.dados.items.find((i) => i.id === item.value) : null;
    return it ? `${card.title} · ${it.title}` : card.title;
  }
  function sugerirTitulo() {
    const nova = sugestao();
    if (nova && (!titulo.value.trim() || titulo.value === tituloAuto)) { titulo.value = nova; tituloAuto = nova; }
  }
  item.addEventListener('change', sugerirTitulo);

  function escolherCard(card) {
    if (!categoria.value) {
      const cc = estado.dados.card_categories.find((x) => x.card_id === card.id);
      if (cc && estado.dados.categories.some((c) => c.id === cc.category_id && !c.archived)) categoria.value = cc.category_id;
    }
    cardId = card.id;
    busca.value = '';
    opcoes.replaceChildren();
    mostrarEscolhido();
    sugerirTitulo();
    atualizarNovoCard();
  }

  busca.addEventListener('input', () => {
    const q = semAcento(busca.value.trim());
    const achados = q ? estado.dados.cards.filter((c) => !c.archived && semAcento(c.title).includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')).slice(0, 8) : [];
    opcoes.replaceChildren(...achados.map((c) => {
      const b = criar('button', { type: 'button', class: 'btn card-opcao', 'data-card': c.id });
      b.textContent = c.title;
      b.addEventListener('click', () => escolherCard(c));
      return b;
    }));
  });

  // repetição semanal
  const repetir = criar('input', { id: 'bloco-repetir', type: 'checkbox' });
  const rotuloRepetir = criar('label', { class: 'repetir' }, repetir, criar('span', { texto: 'Repetir toda semana' }));
  const chipsDias = DIAS_CURTOS.map((nome, i) => {
    const b = criar('button', { type: 'button', class: 'chip dia-rep', 'data-dia': String(i + 1), texto: nome });
    b.addEventListener('click', () => { if (dias.has(i + 1)) dias.delete(i + 1); else dias.add(i + 1); marcarDias(); });
    return b;
  });
  const de = criar('input', { id: 'bloco-de', type: 'date', value: regra ? regra.valid_from : arg.date });
  const ate = criar('input', { id: 'bloco-ate', type: 'date', value: regra?.valid_to || '' });
  const painelRepeticao = criar('div', { class: 'bloco-repeticao', id: 'bloco-repeticao' },
    criar('div', { class: 'chips' }, ...chipsDias),
    criar('div', { class: 'linha-campos' }, campo('A partir de', de), campo('Até (opcional)', ate)));
  function marcarDias() {
    chipsDias.forEach((b) => { const on = dias.has(Number(b.dataset.dia)); b.classList.toggle('ativo', on); b.setAttribute('aria-pressed', String(on)); });
  }
  if (regra) { repetir.checked = true; repetir.disabled = true; }

  // cumprido / não feito: só em bloco que já existe
  const estadoAtual = arg.status || 'planned';
  const botaoEstado = (id, texto, valor) => criar('button', { type: 'button', class: `btn estado-btn estado-${valor}`, id, 'aria-pressed': String(estadoAtual === valor), texto });
  const btnCumprido = botaoEstado('bloco-cumprido', 'Cumprido', 'done');
  const btnNaoFeito = botaoEstado('bloco-nao-feito', 'Não feito', 'missed');
  const btnPlanejado = botaoEstado('bloco-planejado', 'Voltar a planejado', 'planned');
  btnPlanejado.hidden = estadoAtual === 'planned';
  const noLugar = criar('textarea', { id: 'bloco-no-lugar', rows: '3' });
  noLugar.value = arg.instead_note || '';
  const noLugarOk = criar('button', { type: 'button', class: 'btn btn-principal', id: 'bloco-nao-feito-ok', texto: 'Marcar como não feito' });
  const caixaNoLugar = criar('div', { class: 'bloco-no-lugar-caixa', id: 'bloco-no-lugar-caixa' }, campo('O que fiz no lugar', noLugar), noLugarOk);
  caixaNoLugar.hidden = estadoAtual !== 'missed';
  const areaEstado = criar('div', { class: 'bloco-area-estado' },
    criar('div', { class: 'bloco-estado', role: 'group', 'aria-label': 'Estado do bloco' }, btnCumprido, btnNaoFeito, btnPlanejado), caixaNoLugar);
  areaEstado.hidden = novo;

  const campoData = campo('Data', data);
  const erro = criar('div', { id: 'bloco-erro', class: 'erro', role: 'alert' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'bloco-salvar', texto: 'Salvar' });
  const cancelar = criar('button', { type: 'button', class: 'btn', id: 'bloco-cancelar', texto: 'Cancelar' });
  const excluir = criar('button', { type: 'button', class: 'btn perigo', id: 'bloco-excluir', texto: 'Excluir' });
  excluir.hidden = novo;
  const botoes = criar('div', { class: 'linha-botoes' }, salvar, cancelar, excluir);
  const escopo = criar('div', { id: 'bloco-escopo', class: 'bloco-escopo', hidden: '' });

  function atualizarTipo() {
    const podeRepetir = novo || Boolean(regra);
    rotuloRepetir.hidden = !podeRepetir;
    atualizarRepeticao();
  }
  function atualizarRepeticao() {
    const ligado = repetir.checked && !rotuloRepetir.hidden;
    painelRepeticao.hidden = !ligado;
    // Ocorrência de compromisso repetido: a data é a da ocorrência e não muda por aqui.
    campoData.hidden = ligado && novo;
    data.disabled = Boolean(regra);
  }

  repetir.addEventListener('change', atualizarRepeticao);

  function validar() {
    const ini = lerHora(inicio.value);
    const fm = lerHora(fim.value, true);
    if (ini == null || fm == null) return 'Informe o início e o fim.';
    if (fm <= ini) return 'O fim precisa ser depois do início.';
    if (!titulo.value.trim() && !cardId) return 'Dê um título ao bloco.';
    const repetindo = repetir.checked && !rotuloRepetir.hidden;
    if (repetindo) {
      if (!dias.size) return 'Escolha ao menos um dia da semana.';
      if (!de.value) return 'Informe a data de início.';
      if (ate.value && ate.value < de.value) return 'A data final precisa ser depois da inicial.';
    } else if (!data.value) return 'Informe a data.';
    return '';
  }

  // Roda a gravação; se falhar, a folha continua aberta com o texto digitado e o motivo.
  async function executar(acao) {
    if (ocupado) return;
    ocupado = true;
    erro.textContent = '';
    salvar.disabled = true;
    try {
      if ((await acao()) !== MANTER_ABERTA) fecharBloco();
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível salvar.';
      mostrarEscopo(false);
    } finally {
      ocupado = false;
      salvar.disabled = false;
    }
  }

  function mostrarEscopo(ligado) {
    escopo.hidden = !ligado;
    botoes.hidden = ligado;
    areaEstado.hidden = ligado || novo;
  }

  function perguntar(pergunta, escolhas, aoEscolher, { semVoltar = false } = {}) {
    escopo.replaceChildren(criar('p', { texto: pergunta }),
      ...escolhas.map(([v, t, perigo]) => {
        const b = criar('button', { type: 'button', class: `btn menu-item${perigo ? ' perigo' : ''}`, 'data-escopo': v, texto: t });
        b.addEventListener('click', () => executar(() => aoEscolher(v)));
        return b;
      }));
    const voltar = criar('button', { type: 'button', class: 'btn', 'data-escopo-voltar': '', texto: 'Voltar' });
    voltar.addEventListener('click', () => mostrarEscopo(false));
    if (!semVoltar) escopo.append(voltar);
    mostrarEscopo(true);
  }

  // Texto que o usuário escreveu e que ainda não foi gravado (o título sugerido pelo card não conta).
  const notaMudou = () => !caixaNoLugar.hidden && noLugar.value.trim() !== (arg.instead_note || '').trim();
  temTextoAberto = () => notaMudou()
    || (titulo.value.trim() !== (arg.title || '').trim() && titulo.value !== tituloAuto);
  // "Salvar" num bloco já não feito também grava o "o que fiz no lugar" corrigido.
  const patchNota = () => (arg.status === 'missed' && notaMudou() ? { instead_note: noLugar.value.trim() } : {});

  const valores = () => {
    const card = estado.dados.cards.find((c) => c.id === cardId);
    return {
      title: titulo.value.trim() || card?.title || '',
      category_id: categoria.value || null,
      start_min: lerHora(inicio.value),
      end_min: lerHora(fim.value, true),
    };
  };

  salvar.addEventListener('click', () => {
    // "O que fiz no lugar" escrito num bloco que ainda não é não feito só se grava pelo botão do estado.
    if (arg.status !== 'missed' && notaMudou()) {
      erro.textContent = 'Para guardar o que você fez no lugar, toque em “Marcar como não feito”, ou apague o texto.';
      return;
    }
    const problema = validar();
    if (problema) { erro.textContent = problema; return; }
    erro.textContent = '';
    const v = valores();
    const repetindo = repetir.checked && !rotuloRepetir.hidden;
    // Com card é estudo (conta no progresso do card); sem card é compromisso.
    const doCard = () => ({ card_id: cardId, item_id: cardId && !campoItem.hidden ? item.value || null : null, kind: cardId ? 'study' : 'commitment' });
    const regraNova = () => ({ ...v, card_id: cardId, days: [...dias].sort((a, b) => a - b), valid_from: de.value, valid_to: ate.value || null });
    const querCard = novo && !cardId && Boolean(listaPadrao) && (modoCard === 'sempre' || (modoCard === 'perguntar' && criarCard.checked));
    // Cria o card antes do bloco. Se o bloco falhar depois, tentar de novo usa o card já criado.
    async function garantirCard() {
      if (!querCard || cardId) return;
      const listaId = modoCard === 'perguntar' ? novoCardLista.value : listaPadrao.id;
      const lista = listas.find((l) => l.id === listaId);
      const irmaos = estado.dados.cards.filter((c) => c.list_id === listaId);
      const card = await estado.criar('cards', {
        title: (modoCard === 'perguntar' && novoCardTitulo.value.trim()) || v.title,
        list_id: listaId,
        position: irmaos.length ? Math.max(...irmaos.map((c) => c.position)) + 1024 : 1024,
        ...(lista?.is_done ? { completed_at: new Date().toISOString() } : {}),
      });
      cardId = card.id;
      if (v.category_id) await estado.definirCategorias(card.id, [v.category_id]);
      mostrarEscolhido();
      atualizarNovoCard();
    }
    if (novo && repetindo) {
      executar(async () => { await garantirCard(); return estado.criar('commitments', regraNova()); });
      return;
    }
    if (novo) {
      executar(async () => {
        await garantirCard();
        const { kind, ...card } = doCard();
        return estado.criar('blocks', { ...v, date: data.value, kind, ...card, fixed_date: arg.fixed_date || null });
      });
      return;
    }
    if (regra) {
      perguntar('Alterar quais dias?', [['dia', 'Só este dia'], ['todos', 'Todos']], async (esc) => {
        const nota = patchNota();
        if (esc === 'todos') {
          await estado.alterar('commitments', regra.id, regraNova());
          if (Object.keys(nota).length) await gravarBloco(estado, arg, nota);
          return;
        }
        // Ocorrência virtual sem nenhuma mudança não vira linha gravada.
        const { kind, ...card } = doCard();
        const igual = ['title', 'category_id', 'start_min', 'end_min'].every((k) => v[k] === arg[k]) && (arg.card_id || null) === cardId;
        if (!(arg.virtual && igual)) await gravarBloco(estado, arg, { ...v, ...card, ...nota });
      });
      return;
    }
    executar(() => estado.alterar('blocks', arg.id, { ...v, date: data.value, ...doCard(), ...patchNota() }));
  });

  excluir.addEventListener('click', () => {
    if (!regra) {
      if (arg.status === 'done' || arg.status === 'missed') {
        perguntar('Este compromisso já foi marcado. Excluir mesmo assim?', [['confirmar', 'Excluir', true]], () => estado.excluir('blocks', arg.id));
      } else executar(() => estado.excluir('blocks', arg.id));
      return;
    }
    const vespera = somaDias(arg.date, -1);
    const apagaTudo = (esc) => esc === 'todos' || vespera < regra.valid_from; // a cascata leva os blocos
    async function excluirRegra(esc) {
      if (apagaTudo(esc)) { await estado.excluir('commitments', regra.id); return; }
      // Primeiro a regra: se ela falhar, nenhum bloco gravado (cancelado ou editado) foi perdido.
      await estado.alterar('commitments', regra.id, { valid_to: vespera });
      for (const b of estado.dados.blocks.filter((x) => x.commitment_id === regra.id && x.date >= arg.date)) await estado.excluir('blocks', b.id);
    }
    perguntar('Excluir quais dias?', [['dia', 'Só este dia'], ['proximos', 'Este e os próximos'], ['todos', 'Todos', true]], async (esc) => {
      if (esc === 'dia') { await gravarBloco(estado, arg, { cancelled: true }); return undefined; }
      // Dias já marcados como cumprido ou não feito são histórico: apagá-los junto pede confirmação.
      const marcados = estado.dados.blocks.filter((b) => b.commitment_id === regra.id && (b.status === 'done' || b.status === 'missed')
        && (apagaTudo(esc) || b.date >= arg.date)).length;
      if (!marcados) { await excluirRegra(esc); return undefined; }
      perguntar(`Isso apaga também ${marcados} dia(s) já marcado(s) como cumprido ou não feito, com o que você escreveu. Excluir mesmo assim?`,
        [['confirmar', 'Excluir', true]], () => excluirRegra(esc));
      return MANTER_ABERTA;
    });
  });
  cancelar.addEventListener('click', fecharBloco);

  // Cumprido e não feito gravam na hora, sem passar pelo Salvar. O card só é oferecido depois de tudo gravado.
  const aplicarEstado = (valor, nota = '') => executar(async () => {
    const { concluirCard: card } = await mudarEstado(estado, arg, valor, { instead_note: nota });
    if (!card) return undefined;
    perguntar('Concluir este card?', [['sim', 'Concluir card'], ['nao', 'Agora não']],
      async (esc) => {
        if (esc !== 'sim') return;
        try { await concluirCard(estado, card); } catch {
          throw new Error('O compromisso ficou como cumprido, mas não foi possível concluir o card. Mova o card para a lista de concluídos.');
        }
      }, { semVoltar: true });
    return MANTER_ABERTA;
  });
  btnCumprido.addEventListener('click', () => aplicarEstado('done'));
  btnPlanejado.addEventListener('click', () => aplicarEstado('planned'));
  btnNaoFeito.addEventListener('click', () => { caixaNoLugar.hidden = false; noLugar.focus(); });
  noLugarOk.addEventListener('click', () => aplicarEstado('missed', noLugar.value));

  const fundo = criar('div', { class: 'menu-fundo' });
  fecharPeloFundo = () => { if (temTextoAberto()) pedirDescarte(painel, fecharBloco); else fecharBloco(); };
  fundo.addEventListener('click', () => fecharPeloFundo());
  const painel = criar('form', { class: 'menu-folha bloco-painel', novalidate: '' },
    criar('h3', { texto: novo ? 'Novo bloco' : 'Editar bloco' }), areaEstado,
    campo('Título', titulo), caixaEstudo, campo('Categoria', categoria), campoData,
    criar('div', { class: 'linha-campos' }, campo('Início', inicio), campo('Fim', fim)),
    rotuloRepetir, painelRepeticao, erro, botoes, escopo);
  painel.addEventListener('submit', (e) => e.preventDefault());
  camada.replaceChildren(fundo, painel);
  camada.hidden = false;
  document.body.classList.add('sem-rolagem');
  marcarDias();
  mostrarEscolhido();
  if (arg.title && arg.title === sugestao()) tituloAuto = arg.title;
  else if (novo) sugerirTitulo();
  atualizarTipo();
  atualizarNovoCard();
  titulo.focus();
}

// Blocos com menos de 2 h são só cabeça: qualquer toque abre (um estudo de 1 h é tocado para marcar cumprido).
const CORPO_MIN = 120;

// Cabeça (hora + título) abre o bloco; tocar no corpo, abaixo da cabeça, chama `aoCorpo(evento)` — usado para
// criar ou agendar algo naquele horário por cima de um compromisso longo. Enter sempre abre.
export function ligarCabecaECorpo(el, bloco, { aoAbrir = () => abrirBloco(bloco), aoCorpo }) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const cabeca = el.querySelector('.bloco-cabeca');
    const noCorpo = bloco.end_min - bloco.start_min >= CORPO_MIN && cabeca && e.clientY > cabeca.getBoundingClientRect().bottom
      && !e.target.closest('.bloco-alca');
    if (noCorpo) aoCorpo(e, bloco); else aoAbrir();
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) aoAbrir(); });
}

// Clique (e Enter) abre a folha de edição; usado pelas telas Semana e Hoje.
export function ligarAbertura(el, bloco, aoAbrir = () => abrirBloco(bloco)) {
  el.addEventListener('click', (e) => { e.stopPropagation(); aoAbrir(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) aoAbrir(); });
}
