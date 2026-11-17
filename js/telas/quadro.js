// Tela Quadro: colunas (listas) com cards arrastáveis, filtro por categoria e Arquivo.
import { registrarTela } from './casca.js';
import { chipCategoria } from './ajustes.js';
import { progresso } from '../regras/fila.js';
import { registrarTextoNaoSalvo, pedirDescarte } from './folhas.js';

export function criar(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'class') el.className = v;
    else if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v);
  }
  el.append(...filhos);
  return el;
}

const porPosicao = (a, b) => a.position - b.position;

// Itens sempre entregues ordenados por position (a ordem dos grupos vem da primeira aparição).
export const itensOrdenados = (estado) => [...estado.dados.items].sort(porPosicao);

// Média das vizinhas; no fim, última + 1024; no começo, primeira - 1024.
export function posicaoEntre(anterior, seguinte) {
  if (anterior == null && seguinte == null) return 1024;
  if (seguinte == null) return anterior + 1024;
  if (anterior == null) return seguinte - 1024;
  return (anterior + seguinte) / 2;
}

export function posicaoNoFim(linhas) {
  return linhas.length ? Math.max(...linhas.map((l) => l.position)) + 1024 : 1024;
}

// Troca a posição de duas linhas vizinhas; em caso de empate renumera todas na ordem atual antes.
export async function trocarPosicoes(estado, tabela, ordenadas, a, b) {
  let pa = a.position;
  let pb = b.position;
  if (pa === pb) {
    for (let i = 0; i < ordenadas.length; i++) {
      if (ordenadas[i].position !== (i + 1) * 1024) await estado.alterar(tabela, ordenadas[i].id, { position: (i + 1) * 1024 });
    }
    pa = (ordenadas.indexOf(a) + 1) * 1024;
    pb = (ordenadas.indexOf(b) + 1) * 1024;
  }
  await estado.alterar(tabela, a.id, { position: pb });
  await estado.alterar(tabela, b.id, { position: pa });
}

// Move para uma lista (e posição); mexe em completed_at só ao entrar ou sair da lista de conclusão.
export async function moverCard(estado, card, listaId, posicao, extra = {}) {
  const lista = estado.dados.lists.find((l) => l.id === listaId);
  const patch = { ...extra, list_id: listaId, position: posicao };
  if (lista?.is_done && !card.completed_at) patch.completed_at = new Date().toISOString();
  else if (!lista?.is_done && card.completed_at) patch.completed_at = null;
  return estado.alterar('cards', card.id, patch);
}

export const cardsDaLista = (estado, listaId) => estado.dados.cards
  .filter((c) => c.list_id === listaId && !c.archived && !c.is_fixed)
  .sort(porPosicao);

// Tira do Arquivo; se a lista dele sumiu, o card vai para a primeira lista.
export async function restaurarCard(estado, card) {
  if (card.list_id && estado.dados.lists.some((l) => l.id === card.list_id)) {
    await estado.alterar('cards', card.id, { archived: false });
    return;
  }
  const primeira = [...estado.dados.lists].sort(porPosicao)[0];
  if (!primeira) throw new Error('Crie uma lista antes de restaurar o card.');
  await moverCard(estado, card, primeira.id, posicaoNoFim(cardsDaLista(estado, primeira.id)), { archived: false });
}

export function iniciarQuadro({ estado, abrirCard }) {
  const secao = document.querySelector('#tela-quadro');
  let filtro = '';
  let arquivoAberto = false;
  let aviso = '';
  let novoCardEm = null;
  let novoCardTexto = '';
  let novaListaTexto = '';
  registrarTextoNaoSalvo(() => Boolean(novoCardTexto.trim() || novaListaTexto.trim()));
  let arrastando = false;
  let redesenharDepois = false;
  let bloquearClique = false;

  const topo = criar('div', { class: 'quadro-topo' });
  const avisoEl = criar('div', { class: 'erro', id: 'quadro-aviso', role: 'alert' });
  const colunas = criar('div', { class: 'quadro-colunas' });
  const arquivo = criar('div', { class: 'cartao', id: 'quadro-arquivo', hidden: '' });
  const camada = criar('div', { class: 'menu-camada', hidden: '' });
  secao.replaceChildren(topo, avisoEl, colunas, arquivo, camada);

  // ---- ações, sempre com o aviso de erro
  async function tentar(acao) {
    aviso = '';
    try { await acao(); } catch (err) { aviso = err.message || 'Não foi possível salvar.'; }
    avisoEl.textContent = aviso;
  }

  const listasOrdenadas = () => [...estado.dados.lists].sort(porPosicao);

  // ---- folha de menu (listas e cards)
  function fecharMenu() { camada.hidden = true; camada.replaceChildren(); }
  function abrirMenu(classe, titulo, botoes) {
    const folha = criar('div', { class: `menu-folha ${classe}`, role: 'menu' }, criar('h3', { texto: titulo }));
    botoes.forEach((b) => {
      const btn = criar('button', { type: 'button', class: `btn menu-item${b.classe ? ` ${b.classe}` : ''}${b.perigo ? ' perigo' : ''}`, 'data-acao': b.acao, texto: b.texto, ...(b.lista ? { 'data-lista': b.lista } : {}) });
      if (b.desativado) btn.disabled = true;
      btn.addEventListener('click', b.fn);
      folha.append(btn);
    });
    const fundo = criar('div', { class: 'menu-fundo' });
    fundo.addEventListener('click', fecharMenu);
    camada.replaceChildren(fundo, folha);
    camada.hidden = false;
  }

  async function marcarUnica(campo, lista) {
    if (lista[campo]) { await estado.alterar('lists', lista.id, { [campo]: false }); return; }
    // O banco só aceita uma lista com cada marca: desmarca a anterior antes.
    const anterior = estado.dados.lists.find((l) => l[campo] && l.id !== lista.id);
    if (anterior) await estado.alterar('lists', anterior.id, { [campo]: false });
    await estado.alterar('lists', lista.id, { [campo]: true });
  }

  async function excluirLista(lista) {
    const ativos = estado.dados.cards.filter((c) => c.list_id === lista.id && !c.archived);
    if (ativos.length) { aviso = 'Mova ou arquive os cards desta lista antes de excluir.'; avisoEl.textContent = aviso; return; }
    for (const c of estado.dados.cards.filter((x) => x.list_id === lista.id)) await estado.alterar('cards', c.id, { list_id: null });
    await estado.excluir('lists', lista.id);
  }

  function menuDaLista(lista) {
    const todas = listasOrdenadas();
    const i = todas.findIndex((l) => l.id === lista.id);
    const acao = (fn) => () => { fecharMenu(); tentar(fn); };
    abrirMenu('menu-lista', lista.name, [
      { acao: 'subir', texto: 'Mover para a esquerda', desativado: i === 0, fn: acao(() => trocarPosicoes(estado, 'lists', todas, lista, todas[i - 1])) },
      { acao: 'descer', texto: 'Mover para a direita', desativado: i === todas.length - 1, fn: acao(() => trocarPosicoes(estado, 'lists', todas, lista, todas[i + 1])) },
      { acao: 'andamento', texto: lista.is_active ? 'Desmarcar como lista de andamento' : 'Marcar como lista de andamento', fn: acao(() => marcarUnica('is_active', lista)) },
      { acao: 'conclusao', texto: lista.is_done ? 'Desmarcar como lista de conclusão' : 'Marcar como lista de conclusão', fn: acao(() => marcarUnica('is_done', lista)) },
      { acao: 'excluir', texto: 'Excluir lista', perigo: true, fn: acao(() => excluirLista(lista)) },
    ]);
  }

  function menuDoCard(card) {
    const acao = (fn) => () => { fecharMenu(); tentar(fn); };
    const principal = () => abrirMenu('menu-card', card.title, [
      { acao: 'abrir', texto: 'Abrir', fn: () => { fecharMenu(); abrirCard(card.id); } },
      { acao: 'mover', texto: 'Mover para…', fn: escolherLista },
      { acao: 'arquivar', texto: 'Arquivar', fn: acao(() => estado.alterar('cards', card.id, { archived: true })) },
    ]);
    function escolherLista() {
      abrirMenu('menu-card', 'Mover para…', [
        ...listasOrdenadas().map((l) => ({
          acao: 'destino', classe: 'mover-opcao', lista: l.id, texto: l.name + (l.id === card.list_id ? ' (atual)' : ''), desativado: l.id === card.list_id,
          fn: acao(() => moverCard(estado, card, l.id, posicaoNoFim(cardsDaLista(estado, l.id).filter((c) => c.id !== card.id)))),
        })),
        { acao: 'voltar', texto: 'Voltar', fn: principal },
      ]);
    }
    principal();
  }

  // ---- arrastar
  document.addEventListener('touchmove', (e) => { if (arrastando) e.preventDefault(); }, { passive: false });

  function comecarArrasto(el, card, x, y) {
    arrastando = true;
    const caixa = el.getBoundingClientRect();
    const dx = x - caixa.left;
    const dy = y - caixa.top;
    const fantasma = el.cloneNode(true);
    fantasma.classList.add('fantasma');
    Object.assign(fantasma.style, { width: `${caixa.width}px`, left: `${caixa.left}px`, top: `${caixa.top}px` });
    document.body.append(fantasma);
    el.classList.add('arrastando');
    const marcador = criar('div', { class: 'marcador-soltar' });
    const idDe = (n) => (n?.classList.contains('cartao-card') ? n.dataset.card : null);
    const origem = { anterior: idDe(el.previousElementSibling), seguinte: idDe(el.nextElementSibling), lista: card.list_id };
    let ultimoX = x;
    const rolagem = setInterval(() => {
      if (ultimoX < 40) colunas.scrollLeft -= 14;
      else if (ultimoX > window.innerWidth - 40) colunas.scrollLeft += 14;
    }, 16);

    function mover(px, py) {
      ultimoX = px;
      fantasma.style.left = `${px - dx}px`;
      fantasma.style.top = `${py - dy}px`;
      const coluna = document.elementFromPoint(px, py)?.closest('.coluna');
      const corpo = coluna?.querySelector('.coluna-cards');
      if (!corpo) return;
      const outros = [...corpo.querySelectorAll('.cartao-card')].filter((c) => c !== el);
      const depois = outros.find((c) => { const r = c.getBoundingClientRect(); return py < r.top + r.height / 2; });
      if (depois) corpo.insertBefore(marcador, depois); else corpo.append(marcador);
    }

    function terminar(soltou) {
      clearInterval(rolagem);
      fantasma.remove();
      el.classList.remove('arrastando');
      const corpo = marcador.parentElement;
      const vizinho = (lado) => {
        let n = marcador[lado];
        while (n && (n === el || !n.classList.contains('cartao-card'))) n = n[lado];
        return n ? estado.dados.cards.find((c) => c.id === n.dataset.card) : null;
      };
      const anterior = vizinho('previousElementSibling');
      const seguinte = vizinho('nextElementSibling');
      const listaId = corpo?.closest('.coluna')?.dataset.lista;
      marcador.remove();
      arrastando = false;
      bloquearClique = true;
      setTimeout(() => { bloquearClique = false; }, 0);
      const mudou = soltou && listaId && !(listaId === origem.lista
        && (anterior?.id ?? null) === origem.anterior && (seguinte?.id ?? null) === origem.seguinte);
      if (mudou) {
        tentar(() => moverCard(estado, card, listaId, posicaoEntre(anterior?.position, seguinte?.position)));
      } else if (redesenharDepois) { redesenharDepois = false; desenhar(); }
    }
    return { mover, terminar };
  }

  function ligarArrasto(el, card) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button, input, select, textarea')) return;
      const x0 = e.clientX;
      const y0 = e.clientY;
      let ult = { x: x0, y: y0 };
      let arrasto = null;
      let timer = null;
      const limpar = () => {
        clearTimeout(timer);
        document.removeEventListener('pointermove', aoMover);
        document.removeEventListener('pointerup', aoSoltar);
        document.removeEventListener('pointercancel', aoCancelar);
      };
      const iniciar = () => { arrasto = comecarArrasto(el, card, ult.x, ult.y); };
      function aoMover(ev) {
        ult = { x: ev.clientX, y: ev.clientY };
        if (!arrasto) {
          const d = Math.hypot(ult.x - x0, ult.y - y0);
          if (ev.pointerType === 'mouse') { if (d > 6) iniciar(); } else if (d > 10) { limpar(); return; } // no toque, mexer antes dos 300 ms é rolagem
          if (!arrasto) return;
        }
        arrasto.mover(ult.x, ult.y);
      }
      function aoSoltar() { limpar(); if (arrasto) arrasto.terminar(true); }
      function aoCancelar() { limpar(); if (arrasto) arrasto.terminar(false); }
      document.addEventListener('pointermove', aoMover);
      document.addEventListener('pointerup', aoSoltar);
      document.addEventListener('pointercancel', aoCancelar);
      if (e.pointerType !== 'mouse') timer = setTimeout(iniciar, 300);
    });
  }

  // ---- desenho
  const categoriasDoCard = (id) => estado.dados.card_categories.filter((cc) => cc.card_id === id)
    .map((cc) => estado.dados.categories.find((c) => c.id === cc.category_id)).filter(Boolean);

  function cartaoDoCard(card, itens) {
    const chips = categoriasDoCard(card.id).map(chipCategoria);
    const menu = criar('button', { type: 'button', class: 'btn-icone cartao-menu', 'aria-label': 'Opções do card', texto: '⋯' });
    menu.addEventListener('click', (e) => { e.stopPropagation(); menuDoCard(card); });
    const { feitos, total } = progresso(card.id, itens);
    const meta = [];
    if (total) {
      meta.push(criar('span', { class: 'cartao-progresso', texto: `${feitos} de ${total}` }));
      const barra = criar('span', { class: 'barra-mini' }, criar('span'));
      barra.firstChild.style.width = `${Math.round((feitos / total) * 100)}%`;
      meta.push(barra);
    }
    if (card.notes && card.notes.trim()) meta.push(criar('span', { class: 'cartao-nota', title: 'Tem anotações', 'aria-label': 'Tem anotações', texto: '≡' }));
    const el = criar('div', { class: 'cartao-card', 'data-card': card.id, role: 'button', tabindex: '0' },
      menu,
      ...(chips.length ? [criar('div', { class: 'cartao-topo' }, criar('div', { class: 'cartao-chips' }, ...chips))] : []),
      criar('div', { class: 'cartao-titulo', texto: card.title }),
      ...(meta.length ? [criar('div', { class: 'cartao-meta' }, ...meta)] : []));
    el.addEventListener('click', () => { if (!bloquearClique) abrirCard(card.id); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) abrirCard(card.id); });
    ligarArrasto(el, card);
    return el;
  }

  function formNovoCard(lista) {
    const campo = criar('input', { type: 'text', placeholder: 'Título do card', 'aria-label': 'Título do card', autocomplete: 'off', value: novoCardTexto });
    const criarCard = async () => {
      const titulo = campo.value.trim();
      if (!titulo) return;
      const noFim = posicaoNoFim(estado.dados.cards.filter((c) => c.list_id === lista.id));
      novoCardEm = null; novoCardTexto = '';
      await tentar(() => estado.criar('cards', {
        title: titulo, list_id: lista.id, position: noFim, ...(lista.is_done ? { completed_at: new Date().toISOString() } : {}),
      }));
      if (aviso) desenhar();
    };
    const cancelar = () => { novoCardEm = null; novoCardTexto = ''; desenhar(); };
    campo.addEventListener('input', () => { novoCardTexto = campo.value; });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); criarCard(); return; }
      if (e.key !== 'Escape') return;
      // Esc com título digitado pergunta antes de jogar fora.
      if (campo.value.trim()) pedirDescarte(campo.parentElement, cancelar); else cancelar();
    });
    const ok = criar('button', { type: 'button', class: 'btn btn-principal', texto: 'Adicionar' });
    ok.addEventListener('click', criarCard);
    const x = criar('button', { type: 'button', class: 'btn', texto: 'Cancelar' });
    x.addEventListener('click', cancelar);
    return { el: criar('div', { class: 'coluna-novo-card' }, campo, criar('div', { class: 'linha-botoes' }, ok, x)), campo };
  }

  function coluna(lista, itens) {
    const nome = criar('input', { class: 'coluna-nome', type: 'text', value: lista.name, 'aria-label': 'Nome da lista' });
    const renomear = () => {
      const novo = nome.value.trim();
      if (!novo) { nome.value = lista.name; return; }
      if (novo !== lista.name) tentar(() => estado.alterar('lists', lista.id, { name: novo }));
    };
    nome.addEventListener('change', renomear);
    nome.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); nome.blur(); } });
    const menu = criar('button', { type: 'button', class: 'btn-icone coluna-menu', 'aria-label': 'Opções da lista', texto: '⋯' });
    menu.addEventListener('click', () => menuDaLista(lista));
    const marcas = [lista.is_active && 'em andamento', lista.is_done && 'conclusão'].filter(Boolean);

    const visiveis = cardsDaLista(estado, lista.id)
      .filter((c) => !filtro || estado.dados.card_categories.some((cc) => cc.card_id === c.id && cc.category_id === filtro));
    const corpo = criar('div', { class: 'coluna-cards' }, ...visiveis.map((c) => cartaoDoCard(c, itens)));

    const add = criar('button', { type: 'button', class: 'btn coluna-add', 'aria-label': 'Adicionar card', texto: '+ Adicionar card' });
    add.addEventListener('click', () => { novoCardEm = lista.id; novoCardTexto = ''; desenhar(); });
    let rodape = add;
    let focar = null;
    if (novoCardEm === lista.id) { const f = formNovoCard(lista); rodape = f.el; focar = f.campo; }

    const el = criar('div', { class: 'coluna', 'data-lista': lista.id },
      criar('div', { class: 'coluna-topo' }, nome, menu),
      ...(marcas.length ? [criar('div', { class: 'coluna-marca suave', texto: marcas.join(' · ') })] : []),
      corpo, rodape);
    return { el, focar };
  }

  function formNovaLista() {
    const campo = criar('input', { id: 'quadro-nova-lista-nome', type: 'text', placeholder: 'Nome da lista', autocomplete: 'off', value: novaListaTexto, 'aria-label': 'Nome da nova lista' });
    campo.addEventListener('input', () => { novaListaTexto = campo.value; });
    const botao = criar('button', { type: 'submit', class: 'btn btn-principal', id: 'quadro-criar-lista', texto: 'Criar lista' });
    const form = criar('form', { class: 'nova-lista', novalidate: '' }, campo, botao);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = campo.value.trim();
      if (!nome) { aviso = 'Dê um nome à lista.'; avisoEl.textContent = aviso; return; }
      novaListaTexto = '';
      await tentar(() => estado.criar('lists', { name: nome, position: posicaoNoFim(estado.dados.lists) }));
    });
    return form;
  }

  function desenharTopo() {
    const categorias = estado.dados.categories.filter((c) => !c.archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    if (filtro && !estado.dados.categories.some((c) => c.id === filtro)) filtro = '';
    const chip = (id, filho) => {
      const b = criar('button', { type: 'button', class: `filtro-chip${filtro === id ? ' ativo' : ''}`, 'data-cat': id, 'aria-pressed': String(filtro === id) }, filho);
      b.addEventListener('click', () => { filtro = id; desenhar(); });
      return b;
    };
    const filtros = criar('div', { class: 'filtro-categorias' },
      chip('', criar('span', { class: 'chip', texto: 'Todas' })), ...categorias.map((c) => chip(c.id, chipCategoria(c))));
    const arquivados = estado.dados.cards.filter((c) => c.archived && !c.is_fixed).length;
    const btn = criar('button', { type: 'button', class: 'btn', id: 'quadro-arquivo-btn', 'aria-expanded': String(arquivoAberto), texto: `Arquivo (${arquivados})` });
    btn.addEventListener('click', () => { arquivoAberto = !arquivoAberto; desenhar(); });
    topo.replaceChildren(filtros, btn);
  }

  function desenharArquivo() {
    arquivo.hidden = !arquivoAberto;
    if (!arquivoAberto) { arquivo.replaceChildren(); return; }
    const lista = estado.dados.cards.filter((c) => c.archived && !c.is_fixed).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
    const linhas = lista.map((c) => {
      const restaurar = criar('button', { type: 'button', class: 'btn', 'data-acao': 'restaurar', texto: 'Restaurar' });
      restaurar.addEventListener('click', () => tentar(() => restaurarCard(estado, c)));
      const titulo = criar('button', { type: 'button', class: 'arquivado-titulo', texto: c.title });
      titulo.addEventListener('click', () => abrirCard(c.id));
      return criar('div', { class: 'arquivado', 'data-card': c.id }, titulo, restaurar);
    });
    arquivo.replaceChildren(criar('h2', { texto: 'Arquivo' }), ...(linhas.length ? linhas : [criar('p', { class: 'suave', texto: 'Nenhum card arquivado.' })]));
  }

  function desenhar() {
    if (arrastando) { redesenharDepois = true; return; }
    const itens = itensOrdenados(estado);
    desenharTopo();
    const listas = listasOrdenadas();
    let focar = null;
    if (!listas.length) {
      colunas.replaceChildren(criar('div', { class: 'convite-quadro cartao' },
        criar('h2', { texto: 'Seu quadro está vazio' }),
        criar('p', { class: 'suave', texto: 'Crie a primeira lista para começar a organizar seus estudos.' }),
        formNovaLista()));
    } else {
      const feitas = listas.map((l) => coluna(l, itens));
      focar = feitas.find((f) => f.focar)?.focar;
      colunas.replaceChildren(...feitas.map((f) => f.el), criar('div', { class: 'coluna coluna-nova' }, formNovaLista()));
    }
    desenharArquivo();
    if (focar) focar.focus();
  }

  registrarTela('quadro', { mostrar: desenhar });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
