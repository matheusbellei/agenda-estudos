// Blocos do calendário: elemento visual, gravação e (mais abaixo) a folha de criar/editar.
import { corDoTexto, chipCategoria } from './ajustes.js';
import { criarEscolha } from './escolha.js';
import { OPCOES_LEMBRETE, textoDoLembrete } from './notificacoes.js';
import { emOrdem, categoriaParaBloco } from '../regras/tags.js';
import { criarTagPeloBloco } from './tags.js';
import { horaTexto, minutosDe, somaDias, diaDaSemana, DIAS_CURTOS } from '../regras/datas.js';
import { colunasComCards, arvoreParaEscolher } from '../regras/vinculos.js';
import { abrirSeletor } from './vincular.js';
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
      card_id: bloco.card_id || null, baralho_id: bloco.baralho_id || null, title: bloco.title, category_id: bloco.category_id, lembrete_min: bloco.lembrete_min ?? null,
      status: 'planned', instead_note: '', ...patch,
    };
    return est.criar('blocks', { ...linha, ...tipo(linha) });
  }
  return est.alterar('blocks', bloco.id, { ...patch, ...tipo(patch) });
}

// Muda o estado do bloco. Só o próprio bloco muda: card, itens e baralho vinculados nunca são tocados.
export async function mudarEstado(est, bloco, novo, { instead_note = '', motivo } = {}) {
  if (bloco.virtual && novo === 'planned') return { bloco };
  const comMotivo = typeof motivo === 'string' ? { motivo: motivo.trim() } : {};
  // O texto de "o que fiz no lugar" nunca é apagado por mudança de estado: só é regravado em "não feito".
  const gravado = await gravarBloco(est, bloco, novo === 'missed' ? { status: novo, instead_note: instead_note.trim(), ...comMotivo } : { status: novo });
  return { bloco: gravado };
}

export { criar };

// ---- folha de criar e editar

const semAcento = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// type="time" não representa 24:00: no fim, 23:59 e 00:00 valem "até a meia-noite".
function lerHora(texto, ehFim = false) {
  if (!/^\d{2}:\d{2}$/.test(texto)) return null;
  const min = minutosDe(texto);
  return ehFim && (min === 1439 || min === 0) ? 1440 : min;
}
const textoHora = (min) => (min >= 1440 ? '23:59' : horaTexto(min));

function campo(rotulo, input, extra = {}) {
  return criar('label', { class: 'campo', ...extra }, criar('span', { texto: rotulo }), input);
}

export function abrirBloco(arg) {
  const novo = Boolean(arg.novo);
  const regra = !novo && arg.commitment_id ? estado.dados.commitments.find((c) => c.id === arg.commitment_id) : null;
  let cardId = arg.card_id || null;
  let baralhoId = arg.baralho_id || null;
  let ocupado = false;
  let tituloAuto = '';
  const dias = new Set(regra ? regra.days : [diaDaSemana(arg.date)]);

  const titulo = criar('input', { id: 'bloco-titulo', type: 'text', autocomplete: 'off', maxlength: '120' });
  titulo.value = arg.title || '';
  // Categoria em dois passos, como no controle financeiro: a tag e, se quiser, uma subtag dela.
  // As duas listas terminam com a opção de criar, que abre a janela da tela Tags por cima do bloco.
  const NOVA = '__nova__';
  const catPorId = (id) => estado.dados.categories.find((c) => c.id === id) || null;
  const inicial = catPorId(arg.category_id);
  let escolhaTag = inicial ? inicial.parent_id || inicial.id : '';
  let escolhaSub = inicial?.parent_id ? inicial.id : '';
  const nada = (texto) => criar('span', { class: 'escolha-nada', texto });
  const criarOpcao = nada;
  const tagEscolha = criarEscolha({
    id: 'bloco-tag', rotulo: 'Tag', chave: 'cat',
    opcoes: () => {
      const maes = emOrdem(estado.dados.categories, { incluir: new Set([escolhaTag].filter(Boolean)) }).filter((c) => !c.parent_id);
      return [{ id: '', conteudo: nada('Sem tag'), selecionada: !escolhaTag },
        ...maes.map((c) => ({ id: c.id, conteudo: chipCategoria(c), selecionada: c.id === escolhaTag })),
        { id: NOVA, conteudo: criarOpcao('+ Nova tag…'), selecionada: false }];
    },
    resumo: () => { const c = catPorId(escolhaTag); return c ? chipCategoria(c) : 'Sem tag'; },
    aoEscolher: (v) => {
      if (v !== NOVA) { escolhaTag = v; escolhaSub = ''; atualizarEscolhas(); return; }
      criarTagPeloBloco({ aoCriar: (c) => definirCategoria(c.id), aoCancelar: atualizarEscolhas });
    },
  });
  const subFilhas = () => estado.dados.categories.filter((c) => c.parent_id === escolhaTag && (!c.archived || c.id === escolhaSub))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const subEscolha = criarEscolha({
    id: 'bloco-subtag', rotulo: 'Subtag', chave: 'cat',
    opcoes: () => [{ id: '', conteudo: nada('Sem subtag'), selecionada: !escolhaSub },
      ...subFilhas().map((c) => ({ id: c.id, conteudo: chipCategoria(c), selecionada: c.id === escolhaSub })),
      { id: NOVA, conteudo: criarOpcao('+ Nova subtag…'), selecionada: false }],
    resumo: () => { const c = catPorId(escolhaSub); return c ? chipCategoria(c) : 'Sem subtag'; },
    aoEscolher: (v) => {
      if (v !== NOVA) { escolhaSub = v; atualizarEscolhas(); return; }
      criarTagPeloBloco({ mae: catPorId(escolhaTag), aoCriar: (c) => definirCategoria(c.id), aoCancelar: atualizarEscolhas });
    },
  });
  const campoTag = tagEscolha.el;
  const campoSub = subEscolha.el;
  function atualizarEscolhas() {
    if (!escolhaTag) escolhaSub = '';
    campoSub.hidden = !escolhaTag;
    tagEscolha.atualizar(); subEscolha.atualizar();
    // O valor atual fica no botão, para leitura (e testes).
    campoTag.querySelector('#bloco-tag').dataset.valor = escolhaTag;
    campoSub.querySelector('#bloco-subtag').dataset.valor = escolhaSub;
  }
  function definirCategoria(id) {
    const c = catPorId(id);
    escolhaTag = c ? c.parent_id || c.id : '';
    escolhaSub = c?.parent_id ? c.id : '';
    atualizarEscolhas();
  }
  const categoriaValor = () => escolhaSub || escolhaTag || null;
  atualizarEscolhas();
  const data = criar('input', { id: 'bloco-data', type: 'date', value: arg.date });
  const inicio = criar('input', { id: 'bloco-inicio', type: 'time', value: textoHora(arg.start_min) });
  const fim = criar('input', { id: 'bloco-fim', type: 'time', value: textoHora(arg.end_min) });


  // Vínculos, só para organização (nada acontece no card nem no baralho ao cumprir o bloco):
  // card (busca pelo título ou por coluna do Quadro) e baralho ou grupo de flashcards.
  const busca = criar('input', { id: 'bloco-card-busca', type: 'search', placeholder: 'Buscar card pelo título', autocomplete: 'off' });
  const opcoes = criar('div', { id: 'bloco-card-opcoes', class: 'card-opcoes' });
  const escolhido = criar('div', { id: 'bloco-card-escolhido', class: 'card-escolhido' });
  const porColuna = criar('button', { type: 'button', class: 'btn', id: 'bloco-card-colunas', texto: 'Escolher por coluna' });
  porColuna.addEventListener('click', () => abrirSeletor({
    titulo: 'Escolher card', raiz: colunasComCards(estado.dados), vazio: 'Nenhum card no Quadro.',
    aoEscolher: (id) => { const c = estado.dados.cards.find((x) => x.id === id); if (c) escolherCard(c); },
  }));
  // Card que nasce junto com o bloco: o bloco novo sem card sempre pergunta ("Criar card para este bloco",
  // desmarcado), sugerindo a lista ativa. Sem listas no Quadro, não oferece.
  const listas = [...estado.dados.lists].sort((a, b) => a.position - b.position);
  const listaPadrao = listas.find((l) => l.is_active) || listas[0] || null;
  const modoCard = listaPadrao ? 'perguntar' : 'nunca';
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
    caixaNovoCard.hidden = !(novo && !cardId && !baralhoId && modoCard === 'perguntar');
    detalhesNovoCard.hidden = !criarCard.checked;
    if (!novoCardTituloEditado) novoCardTitulo.value = titulo.value.trim();
  }
  criarCard.addEventListener('change', atualizarNovoCard);
  titulo.addEventListener('input', atualizarNovoCard);

  const tirar = criar('button', { type: 'button', class: 'btn', id: 'bloco-card-tirar', texto: 'Tirar card' });
  tirar.addEventListener('click', () => { cardId = null; mostrarEscolhido(); atualizarNovoCard(); });
  const caixaEstudo = criar('div', { class: 'bloco-estudo' }, campo('Card (opcional)', busca), opcoes, porColuna, escolhido, caixaNovoCard);

  const baralhoPorId = (id) => estado.dados.baralhos.find((b) => b.id === id) || null;
  const baralhoEscolhido = criar('div', { id: 'bloco-baralho-escolhido', class: 'vinculo-escolhido' });
  const escolherBaralho = criar('button', { type: 'button', class: 'btn', id: 'bloco-baralho-escolher', texto: 'Vincular baralho de flashcards' });
  escolherBaralho.addEventListener('click', () => abrirSeletor({
    titulo: 'Escolher baralho ou grupo', raiz: arvoreParaEscolher(estado.dados.baralhos), vazio: 'Nenhum baralho criado ainda.',
    aoEscolher: (id) => { baralhoId = id; mostrarBaralho(); sugerirTitulo(); atualizarNovoCard(); },
  }));
  const caixaBaralho = criar('div', { class: 'bloco-estudo' }, criar('span', { class: 'suave', texto: 'Baralho ou grupo de flashcards (opcional)' }), baralhoEscolhido, escolherBaralho);
  function mostrarBaralho() {
    const b = baralhoPorId(baralhoId);
    baralhoEscolhido.replaceChildren();
    baralhoEscolhido.hidden = !b;
    escolherBaralho.hidden = Boolean(b);
    if (!b) return;
    const tirarB = criar('button', { type: 'button', class: 'btn', id: 'bloco-baralho-tirar', texto: 'Tirar' });
    tirarB.addEventListener('click', () => { baralhoId = null; mostrarBaralho(); atualizarNovoCard(); });
    baralhoEscolhido.append(criar('span', { class: 'nome', texto: `${b.e_grupo ? 'Grupo' : 'Baralho'}: ${b.nome}` }), tirarB);
  }

  function mostrarEscolhido() {
    const card = estado.dados.cards.find((c) => c.id === cardId);
    escolhido.replaceChildren();
    escolhido.hidden = !card;
    porColuna.hidden = Boolean(card);
    if (!card) return;
    const abrir = criar('button', { type: 'button', class: 'btn', id: 'bloco-card-abrir', texto: 'Abrir card' });
    abrir.addEventListener('click', () => { fecharBloco(); abrirCardFn(card.id); });
    escolhido.append(criar('span', { class: 'card-escolhido-nome', texto: card.title }), abrir, tirar);
  }

  // O título que o bloco leva quando o usuário não escreveu outro: o do card ou, sem card, o do baralho.
  function sugestao() {
    const card = estado.dados.cards.find((c) => c.id === cardId);
    return card ? card.title : baralhoPorId(baralhoId)?.nome || '';
  }
  function sugerirTitulo() {
    const nova = sugestao();
    if (nova && (!titulo.value.trim() || titulo.value === tituloAuto)) { titulo.value = nova; tituloAuto = nova; }
  }

  function escolherCard(card) {
    // Tag vazia: vem a do card (a subtag, se houver). Tag já escolhida nunca é trocada; tag arquivada não vem.
    if (!categoriaValor()) {
      const ids = estado.dados.card_categories.filter((x) => x.card_id === card.id).map((x) => x.category_id);
      const id = categoriaParaBloco(estado.dados.categories, ids);
      if (id && estado.dados.categories.some((c) => c.id === id && !c.archived)) definirCategoria(id);
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
  // Lembrete: vazio = o padrão das Configurações → Notificações; senão minutos antes (−1 nenhum, 0 na hora).
  const lembrete = criar('select', { id: 'bloco-lembrete' },
    criar('option', { value: '', texto: `Padrão (${textoDoLembrete(estado.ajustes().notif_antes_min).toLowerCase()})` }),
    ...OPCOES_LEMBRETE.map(([v, t]) => criar('option', { value: String(v), texto: t })));
  {
    // Só o do próprio bloco: a ocorrência virtual já chega com o da fixa; um bloco gravado tem o seu.
    const proprio = arg.lembrete_min ?? null;
    lembrete.value = proprio === null || proprio === undefined ? '' : String(proprio);
  }
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
  if (regra) repetir.checked = true;

  // Cumprido / não feito: só em bloco que já existe. É uma escolha da folha: só vale ao tocar em Salvar.
  const estadoAntes = arg.status || 'planned';
  let estadoEscolhido = estadoAntes;
  const botaoEstado = (id, texto, valor) => criar('button', { type: 'button', class: `btn estado-btn estado-${valor}`, id, 'aria-pressed': String(estadoAntes === valor), texto });
  const btnCumprido = botaoEstado('bloco-cumprido', 'Cumprido', 'done');
  const btnNaoFeito = botaoEstado('bloco-nao-feito', 'Não feito', 'missed');
  // Não feito: o porquê e o que fez no lugar (opcionais).
  const motivo = criar('textarea', { id: 'bloco-motivo', rows: '2', placeholder: 'Opcional' });
  motivo.value = arg.motivo || '';
  const noLugar = criar('textarea', { id: 'bloco-no-lugar', rows: '3', placeholder: 'Opcional' });
  noLugar.value = arg.instead_note || '';
  const caixaNoLugar = criar('div', { class: 'bloco-no-lugar-caixa', id: 'bloco-no-lugar-caixa' },
    campo('Por que não fez?', motivo), campo('O que fez no lugar?', noLugar));
  caixaNoLugar.hidden = estadoAntes !== 'missed';
  const areaEstado = criar('div', { class: 'bloco-area-estado' },
    criar('div', { class: 'bloco-estado', role: 'group', 'aria-label': 'Estado do bloco' }, btnCumprido, btnNaoFeito), caixaNoLugar);
  areaEstado.hidden = novo;
  function mostrarEstado() {
    for (const [b, v] of [[btnCumprido, 'done'], [btnNaoFeito, 'missed']]) b.setAttribute('aria-pressed', String(estadoEscolhido === v));
    caixaNoLugar.hidden = estadoEscolhido !== 'missed';
  }
  // Tocar no estado que já está escolhido desfaz: volta a planejado.
  btnCumprido.addEventListener('click', () => { estadoEscolhido = estadoEscolhido === 'done' ? 'planned' : 'done'; mostrarEstado(); });
  btnNaoFeito.addEventListener('click', () => { estadoEscolhido = estadoEscolhido === 'missed' ? 'planned' : 'missed'; mostrarEstado(); });

  const campoData = campo('Data', data);
  const erro = criar('div', { id: 'bloco-erro', class: 'erro', role: 'alert' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'bloco-salvar', texto: 'Salvar' });
  const cancelar = criar('button', { type: 'button', class: 'btn', id: 'bloco-cancelar', texto: 'Cancelar' });
  const excluir = criar('button', { type: 'button', class: 'btn perigo', id: 'bloco-excluir', texto: 'Excluir' });
  excluir.hidden = novo;
  const botoes = criar('div', { class: 'linha-botoes' }, salvar, cancelar, excluir);
  const escopo = criar('div', { id: 'bloco-escopo', class: 'bloco-escopo', hidden: '' });

  function atualizarTipo() {
    // Também o compromisso já salvo (sem regra) pode passar a repetir toda semana.
    const podeRepetir = novo || Boolean(regra) || !arg.commitment_id;
    rotuloRepetir.hidden = !podeRepetir;
    atualizarRepeticao();
  }
  function atualizarRepeticao() {
    const ligado = repetir.checked && !rotuloRepetir.hidden;
    painelRepeticao.hidden = !ligado;
    // Ocorrência de compromisso repetido: a data é a da ocorrência e não muda por aqui.
    campoData.hidden = ligado && !regra;
    data.disabled = Boolean(regra);
  }

  repetir.addEventListener('change', atualizarRepeticao);

  function validar() {
    const ini = lerHora(inicio.value);
    const fm = lerHora(fim.value, true);
    if (ini == null || fm == null) return 'Informe o início e o fim.';
    if (fm <= ini) return 'O fim precisa ser depois do início.';
    if (!titulo.value.trim() && !cardId && !baralhoId) return 'Dê um título ao bloco.';
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

  // O que mudou no estado (e nos textos do "não feito") desde que a folha abriu. Só isso vai no Salvar do estado.
  const notaMudou = () => estadoEscolhido === 'missed' && noLugar.value.trim() !== (arg.instead_note || '').trim();
  const motivoMudou = () => estadoEscolhido === 'missed' && motivo.value.trim() !== (arg.motivo || '').trim();
  const estadoMudou = () => estadoEscolhido !== estadoAntes || notaMudou() || motivoMudou();
  const patchEstado = () => {
    if (!estadoMudou()) return {};
    return {
      ...(estadoEscolhido !== estadoAntes ? { status: estadoEscolhido } : {}),
      ...(estadoEscolhido === 'missed' ? { instead_note: noLugar.value.trim(), motivo: motivo.value.trim() } : {}),
    };
  };
  // Pergunta antes de descartar o que não foi salvo: o título digitado (o sugerido pelo card não conta) e o estado.
  temTextoAberto = () => (titulo.value.trim() !== (arg.title || '').trim() && titulo.value !== tituloAuto) || estadoMudou();

  const valores = () => {
    const card = estado.dados.cards.find((c) => c.id === cardId);
    return {
      title: titulo.value.trim() || card?.title || baralhoPorId(baralhoId)?.nome || '',
      category_id: categoriaValor(),
      lembrete_min: lembrete.value === '' ? null : Number(lembrete.value),
      start_min: lerHora(inicio.value),
      end_min: lerHora(fim.value, true),
    };
  };

  salvar.addEventListener('click', () => {
    const problema = validar();
    if (problema) { erro.textContent = problema; return; }
    erro.textContent = '';
    const v = valores();
    const repetindo = repetir.checked && !rotuloRepetir.hidden;
    // Com card é estudo (conta no progresso do card); sem card é compromisso. O baralho é só vínculo.
    const doCard = () => ({ card_id: cardId, baralho_id: baralhoId, item_id: null, kind: cardId ? 'study' : 'commitment' });
    const regraNova = () => ({ ...v, card_id: cardId, baralho_id: baralhoId, days: [...dias].sort((a, b) => a - b), valid_from: de.value, valid_to: ate.value || null });
    const querCard = novo && !cardId && !baralhoId && Boolean(listaPadrao) && modoCard === 'perguntar' && criarCard.checked;
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
        const { kind, ...vinculos } = doCard();
        return estado.criar('blocks', { ...v, date: data.value, kind, ...vinculos, fixed_date: arg.fixed_date || null });
      });
      return;
    }
    if (repetindo && !regra) {
      // Bloco que já existe passa a repetir: cria a regra e, se ele cai nela, vira a ocorrência daquele dia
      // (mantém estado, anotações e card; assim a regra não gera uma cópia no mesmo dia).
      executar(async () => {
        const nova = await estado.criar('commitments', regraNova());
        const cai = arg.date >= de.value && (!ate.value || arg.date <= ate.value) && dias.has(diaDaSemana(arg.date));
        if (cai) await estado.alterar('blocks', arg.id, { ...v, ...doCard(), ...patchEstado(), commitment_id: nova.id });
        return nova;
      });
      return;
    }
    if (regra && !repetir.checked) {
      // Desmarcar repetição: a partir deste dia o compromisso vira avulso; os dias anteriores continuam repetindo.
      executar(async () => {
        const { kind, ...vinculos } = doCard();
        await gravarBloco(estado, arg, { ...v, ...vinculos, ...patchEstado(), commitment_id: null });
        for (const b of estado.dados.blocks.filter((x) => x.commitment_id === regra.id && x.date >= arg.date)) {
          if (b.status === 'planned') await estado.excluir('blocks', b.id);
          else await estado.alterar('blocks', b.id, { commitment_id: null });
        }
        if (arg.date > regra.valid_from) await estado.alterar('commitments', regra.id, { valid_to: somaDias(arg.date, -1) });
        else await estado.excluir('commitments', regra.id);
      });
      return;
    }
    if (regra) {
      const camposIguais = ['title', 'category_id', 'start_min', 'end_min'].every((k) => v[k] === arg[k])
        && (arg.card_id || null) === cardId && (arg.baralho_id || null) === baralhoId && (arg.lembrete_min ?? null) === v.lembrete_min;
      const regraIgual = [...dias].sort().join() === [...regra.days].sort().join() && de.value === regra.valid_from && (ate.value || null) === (regra.valid_to || null);
      // Só o estado (e os textos do "não feito") mudou: vale para este dia, sem perguntar "quais dias".
      if (camposIguais && regraIgual) {
        executar(async () => { const p = patchEstado(); if (Object.keys(p).length) await gravarBloco(estado, arg, p); });
        return;
      }
      perguntar('Alterar a partir de quando?', [['dia', 'Este dia'], ['proximos', 'Este e os próximos']], async (esc) => {
        const patch = patchEstado();
        const { kind, ...vinculos } = doCard();
        // Ocorrência virtual sem nenhuma mudança não vira linha gravada.
        const mudou = !(arg.virtual && camposIguais && !Object.keys(patch).length);
        if (esc === 'dia') { if (mudou) await gravarBloco(estado, arg, { ...v, ...vinculos, ...patch }); return; }
        if (arg.date <= regra.valid_from) {
          await estado.alterar('commitments', regra.id, regraNova());
          if (Object.keys(patch).length) await gravarBloco(estado, arg, patch);
          return;
        }
        // Este e os próximos: a regra antiga termina na véspera; a nova começa neste dia com a mudança.
        const nova = await estado.criar('commitments', { ...regraNova(), valid_from: arg.date });
        if (mudou) await gravarBloco(estado, arg, { ...v, ...vinculos, ...patch, commitment_id: nova.id });
        for (const b of estado.dados.blocks.filter((x) => x.commitment_id === regra.id && x.date >= arg.date)) {
          if (b.status === 'planned') await estado.excluir('blocks', b.id);
          else await estado.alterar('blocks', b.id, { commitment_id: nova.id });
        }
        await estado.alterar('commitments', regra.id, { valid_to: somaDias(arg.date, -1) });
      });
      return;
    }
    executar(() => estado.alterar('blocks', arg.id, { ...v, date: data.value, ...doCard(), ...patchEstado() }));
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
  cancelar.addEventListener('click', () => fecharBloco());

  const fundo = criar('div', { class: 'menu-fundo' });
  fecharPeloFundo = () => { if (temTextoAberto()) pedirDescarte(painel, () => fecharBloco()); else fecharBloco(); };
  fundo.addEventListener('click', () => fecharPeloFundo());
  const painel = criar('form', { class: 'menu-folha bloco-painel', novalidate: '' },
    criar('h3', { texto: novo ? 'Novo bloco' : 'Editar bloco' }), areaEstado,
    campo('Título', titulo), caixaEstudo, caixaBaralho, campoTag, campoSub, campoData,
    criar('div', { class: 'linha-campos' }, campo('Início', inicio), campo('Fim', fim)),
    campo('Lembrete', lembrete),
    rotuloRepetir, painelRepeticao, erro, botoes, escopo);
  painel.addEventListener('submit', (e) => e.preventDefault());
  camada.replaceChildren(fundo, painel);
  camada.hidden = false;
  document.body.classList.add('sem-rolagem');
  marcarDias();
  mostrarEscolhido();
  mostrarBaralho();
  if (arg.title && arg.title === sugestao()) tituloAuto = arg.title;
  else if (novo) sugerirTitulo();
  atualizarTipo();
  atualizarNovoCard();
  // Bloco novo já abre no título; um que já existe abre sem teclado (para ler, marcar ou mexer em outro campo).
  if (novo) titulo.focus();
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
