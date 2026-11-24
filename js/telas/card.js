// Card aberto numa folha sobre a tela: título, categorias, lista, anotações, itens, anexos e ações.
import { criar, itensOrdenados, moverCard, posicaoNoFim, trocarPosicoes, cardsDaLista, restaurarCard } from './quadro.js';
import { emOrdem, nomeCompleto, categoriaDoCard, trocarTag, alternarSubtag } from '../regras/tags.js';
import { criarEscolha, fecharEscolhaAberta } from './escolha.js';
import { chipCategoria } from './ajustes.js';
import { progresso, proximoItem } from '../regras/fila.js';
import { abrirBloco } from './bloco.js';
import { isoDe, somaDias } from '../regras/datas.js';
import { horasDoCard, formatarHoras } from '../regras/acompanhamento.js';
import { agoraNoFuso } from '../regras/lembretes.js';
import { registrosDoDiario } from '../regras/diario.js';
import { itemDoDiario } from './diario.js';
import { abrirAgendarRevisao, cancelarRevisoes } from './revisoes.js';
import { textoDasRevisoes } from '../regras/revisoes.js';
import { abrirFormularioFlash, itemDeFlash } from './flashcards.js';
import { estudar } from './flash-sessao.js';
import { irPara as irParaTela } from './casca.js';
import { paraHoje } from '../regras/flash.js';
import { hojeDoApp } from './revisoes.js';
import { caminhosNoMarkdown, comEnderecos, semEnderecos, nomeParaCaminho } from '../regras/anexos.js';
import { criarEditor, modoVisual } from '../editor.js';
import { registrarTextoNaoSalvo } from './folhas.js';

const DIAS = [[1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom']];
const ESPERA_GRAVAR = 1500;
const LIMITE_ANEXO = 10 * 1024 * 1024;

// Rascunho local de uma anotação ainda não gravada: sobrevive a recarregar a página.
// Enquanto o aviso de um rascunho antigo está aberto, o que se digita vai para a chave `:novo`,
// para o rascunho antigo continuar guardado até o usuário escolher "Recuperar" ou "Descartar".
const NOVO = ':novo';
const OUTRO = ':outro';
const chaveRascunho = (tabela, id, sufixo = '') => `rascunho:${tabela}:${id}${sufixo}`;
function lerRascunho(tabela, id, sufixo = '') {
  try { return JSON.parse(localStorage.getItem(chaveRascunho(tabela, id, sufixo)) || 'null'); } catch { return null; }
}
function guardarRascunho(tabela, id, texto, base, sufixo = '') {
  try { localStorage.setItem(chaveRascunho(tabela, id, sufixo), JSON.stringify({ texto, base, em: new Date().toISOString() })); } catch { /* sem espaço: segue sem rascunho */ }
}
// Sem `sufixo`, apaga as duas chaves da anotação.
function apagarRascunho(tabela, id, sufixo) {
  try {
    for (const s of sufixo === undefined ? ['', NOVO, OUTRO] : [sufixo]) localStorage.removeItem(chaveRascunho(tabela, id, s));
  } catch { /* nada a fazer */ }
}
const CONFLITO = 'Esta anotação foi alterada em outro aparelho.';
const enderecoValido = (texto) => {
  try { return ['http:', 'https:'].includes(new URL(texto).protocol); } catch { return false; }
};

let abrirImpl = () => {};
export function abrirCard(id, opcoes) { return abrirImpl(id, opcoes); }

export function iniciarCard({ estado, store }) {
  const folha = criar('div', { id: 'folha-card', class: 'folha-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Card', hidden: '' });
  document.body.append(folha);

  let cardId = null;
  let nodos = null; // referências do que foi montado para o card aberto
  let painelFixa = false;
  let dias = new Set();
  const pendentes = new Map(); // chave da anotação -> { reg, timer, emCurso }
  let notasCard = null;        // editor das anotações gerais
  let notasItem = null;        // { id, reg }: só um editor de item montado por vez

  const card = () => estado.dados.cards.find((c) => c.id === cardId);
  const itensDoCard = () => itensOrdenados(estado).filter((i) => i.card_id === cardId);
  const erro = (msg) => { if (nodos) nodos.erro.textContent = msg || ''; };
  const situacao = (msg) => { if (nodos) nodos.salvar.textContent = msg; };
  async function tentar(acao) {
    erro('');
    try { await acao(); return true; } catch (err) { erro(err.message || 'Não foi possível salvar.'); return false; }
  }

  // ---- anotações: um editor por anotação, com rascunho local até a gravação dar certo
  const chaveNota = (reg) => `${reg.tabela}:${reg.id}`;
  const linhaDe = (reg) => estado.dados[reg.tabela].find((x) => x.id === reg.id);
  const textoDe = (reg) => semEnderecos(reg.editor.markdown(), reg.mapa);

  // `base` é o texto que o editor recebeu (ou o último gravado por ele): só se grava por cima se o banco ainda o tiver.
  function montarNotas(container, tabela, id) {
    const texto = estado.dados[tabela].find((x) => x.id === id)?.notes || '';
    const reg = { tabela, id, editor: null, mapa: {}, vivo: true, base: texto, avisoAberto: false, conflito: false };
    const criarJa = (mapa) => {
      if (!reg.vivo) return;
      reg.mapa = mapa;
      reg.aviso = criar('div', { class: 'rascunho-lugar' });
      reg.conflitoEl = criar('div', { class: 'conflito-lugar' });
      const corpo = criar('div', { class: 'notas-editor' });
      container.replaceChildren(reg.aviso, reg.conflitoEl, corpo);
      reg.editor = criarEditor(corpo, {
        markdown: comEnderecos(texto, mapa),
        aoMudar: () => mudou(reg),
        aoColarImagem: (arquivo) => colarImagem(reg, arquivo),
      });
      oferecerRascunho(reg);
    };
    // No modo visual as imagens anexadas precisam de URL temporária para aparecer.
    const caminhos = modoVisual(texto) ? [...new Set(caminhosNoMarkdown(texto))] : [];
    if (!caminhos.length) criarJa({});
    else {
      Promise.all(caminhos.map((c) => store.signedUrl(c).then((u) => [c, u], () => null)))
        .then((pares) => criarJa(Object.fromEntries(pares.filter(Boolean))));
    }
    reg.destruir = () => { reg.vivo = false; reg.editor?.destruir(); container.replaceChildren(); };
    return reg;
  }

  // Oferece um rascunho por vez, na ordem: principal, `:novo` (digitado com o aviso aberto, que vira principal
  // ao ser oferecido) e `:outro` (texto digitado guardado por "Ver a versão mais recente" com um aviso aberto).
  function oferecerRascunho(reg) {
    const { aviso } = reg;
    if (!aviso || reg.avisoAberto) return;
    const gravado = linhaDe(reg)?.notes ?? '';
    let r = null;
    let sufixo = '';
    for (const s of ['', NOVO, OUTRO]) {
      const x = lerRascunho(reg.tabela, reg.id, s);
      if (!x) continue;
      if (x.texto === gravado) { apagarRascunho(reg.tabela, reg.id, s); continue; }
      if (x.texto === textoDe(reg)) continue; // é o que já está no editor (e talvez ainda por gravar)
      r = x; sufixo = s; break;
    }
    if (!r) return;
    if (sufixo === NOVO) {
      guardarRascunho(reg.tabela, reg.id, r.texto, r.base);
      apagarRascunho(reg.tabela, reg.id, NOVO);
      sufixo = '';
    }
    const recuperar = criar('button', { type: 'button', class: 'btn', 'data-acao': 'recuperar', texto: 'Recuperar' });
    const descartarBtn = criar('button', { type: 'button', class: 'btn', 'data-acao': 'descartar', texto: 'Descartar' });
    const fecharAviso = () => { aviso.replaceChildren(); reg.avisoAberto = false; };
    recuperar.addEventListener('click', () => {
      fecharAviso();
      apagarRascunho(reg.tabela, reg.id, NOVO);
      if (sufixo) apagarRascunho(reg.tabela, reg.id, sufixo);
      reg.editor.definir(comEnderecos(r.texto, reg.mapa));
      mudou(reg);
      oferecerRascunho(reg);
    });
    descartarBtn.addEventListener('click', () => {
      fecharAviso();
      apagarRascunho(reg.tabela, reg.id, sufixo);
      // O que foi digitado com o aviso aberto e ainda não foi gravado volta a ser o rascunho principal.
      if (!sufixo && pendentes.has(chaveNota(reg))) {
        guardarRascunho(reg.tabela, reg.id, textoDe(reg), reg.base);
        apagarRascunho(reg.tabela, reg.id, NOVO);
      }
      oferecerRascunho(reg);
    });
    reg.avisoAberto = true;
    aviso.replaceChildren(criar('div', { class: 'rascunho', role: 'status' },
      criar('span', { texto: 'Há um rascunho não salvo' }), recuperar, descartarBtn));
  }

  function mostrarConflito(reg) {
    const chave = chaveNota(reg);
    const ver = criar('button', { type: 'button', class: 'btn', 'data-acao': 'ver-recente', texto: 'Ver a versão mais recente' });
    const manter = criar('button', { type: 'button', class: 'btn', 'data-acao': 'manter', texto: 'Manter a minha' });
    ver.addEventListener('click', () => tentar(async () => {
      const atual = await store.get(reg.tabela, reg.id);
      if (!atual) throw new Error('Esta anotação não existe mais.');
      // O texto do usuário já está no rascunho (guardado a cada alteração) e será oferecido de novo.
      // Se ele foi digitado com o aviso de outro rascunho aberto, está em `:novo`: vai para `:outro`,
      // para nem "Recuperar" (que descarta o `:novo`) nem novas digitações o apagarem.
      const novo = lerRascunho(reg.tabela, reg.id, NOVO);
      if (novo) { guardarRascunho(reg.tabela, reg.id, novo.texto, novo.base, OUTRO); apagarRascunho(reg.tabela, reg.id, NOVO); }
      const p = pendentes.get(chave);
      clearTimeout(p?.timer);
      pendentes.delete(chave);
      reg.conflito = false;
      reg.conflitoEl?.replaceChildren();
      reg.base = atual.notes;
      estado.substituirLocal(reg.tabela, atual);
      reg.editor.definir(comEnderecos(atual.notes, reg.mapa));
      situacao('');
      oferecerRascunho(reg);
    }));
    manter.addEventListener('click', () => {
      const p = pendentes.get(chave);
      if (!p) return;
      p.forcar = true;
      descarregar(chave);
    });
    reg.conflitoEl?.replaceChildren(criar('div', { class: 'conflito', role: 'alert' },
      criar('span', { texto: CONFLITO }), criar('div', { class: 'linha-botoes' }, ver, manter)));
  }

  function mudou(reg) {
    guardarRascunho(reg.tabela, reg.id, textoDe(reg), reg.base, reg.avisoAberto ? NOVO : '');
    situacao('Salvando…');
    const chave = chaveNota(reg);
    const p = pendentes.get(chave) || { reg, timer: null, emCurso: null };
    clearTimeout(p.timer);
    p.reg = reg;
    p.timer = setTimeout(() => descarregar(chave), ESPERA_GRAVAR);
    pendentes.set(chave, p);
  }

  // Antes de gravar, confere no banco se a anotação ainda é a `base`: se outro aparelho a mudou, não sobrescreve.
  async function gravarNota(chave, p) {
    const { reg } = p;
    const linha = linhaDe(reg);
    const texto = textoDe(reg);
    if (!linha) { pendentes.delete(chave); apagarRascunho(reg.tabela, reg.id); return true; }
    try {
      if (texto !== reg.base) {
        if (!p.forcar) {
          const atual = await store.get(reg.tabela, reg.id);
          if (atual && atual.notes !== reg.base && atual.notes !== texto) {
            // Fica pendente e com rascunho, como numa falha: o card só fecha depois de o usuário escolher.
            reg.conflito = true;
            mostrarConflito(reg);
            situacao('Não salvo');
            return false;
          }
        }
        await estado.alterar(reg.tabela, reg.id, { notes: texto });
        reg.base = texto;
      }
    } catch (err) {
      // Fica pendente e com rascunho: fechar, arquivar ou trocar de card não seguem até gravar.
      erro(err.message || 'Não foi possível salvar.');
      situacao('Não salvo');
      return false;
    }
    p.forcar = false;
    if (reg.conflito) { reg.conflito = false; reg.conflitoEl?.replaceChildren(); }
    if (reg.vivo && textoDe(reg) !== texto) return true; // digitou durante a gravação: o resto já está agendado
    if (!p.timer) pendentes.delete(chave);
    // Com o aviso de rascunho aberto, o rascunho antigo continua guardado até o usuário escolher.
    apagarRascunho(reg.tabela, reg.id, reg.avisoAberto ? NOVO : undefined);
    erro('');
    situacao('Salvo');
    return true;
  }

  function descarregar(chave) {
    const p = pendentes.get(chave);
    if (!p) return Promise.resolve(true);
    clearTimeout(p.timer);
    p.timer = null;
    if (!p.emCurso) p.emCurso = gravarNota(chave, p).finally(() => { p.emCurso = null; });
    return p.emCurso;
  }
  // Repete enquanto surgir texto novo durante uma gravação.
  async function descarregarTudo() {
    for (let volta = 0; volta < 5 && pendentes.size; volta++) {
      const resultados = await Promise.all([...pendentes.keys()].map(descarregar));
      if (resultados.includes(false)) return false;
    }
    return !pendentes.size;
  }
  function descartar(tabela, id) {
    const chave = `${tabela}:${id}`;
    clearTimeout(pendentes.get(chave)?.timer);
    pendentes.delete(chave);
    apagarRascunho(tabela, id);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') descarregarTudo(); });
  window.addEventListener('pagehide', () => { descarregarTudo(); });
  registrarTextoNaoSalvo(() => pendentes.size > 0);


  function fecharNotasItem() {
    if (!notasItem) return;
    notasItem.reg.destruir();
    const l = linhas.get(notasItem.id);
    if (l) { l.el.classList.remove('aberto'); l.expandir.setAttribute('aria-expanded', 'false'); }
    notasItem = null;
  }

  function ocultar() {
    fecharEscolhaAberta();
    pendentes.forEach((p) => clearTimeout(p.timer));
    pendentes.clear();
    notasCard?.destruir();
    notasCard = null;
    fecharNotasItem();
    folha.hidden = true;
    folha.replaceChildren();
    document.body.classList.remove('sem-rolagem');
    cardId = null;
    nodos = null;
  }
  async function fechar() {
    if (!(await descarregarTudo())) return;
    ocultar();
  }

  // ---- anexos
  async function enviarArquivo(arquivo, idDoCard) {
    if (arquivo.size > LIMITE_ANEXO) throw new Error('O arquivo passa do limite de 10 MB.');
    const caminho = `${store.currentUser().id}/${idDoCard}/${crypto.randomUUID()}-${nomeParaCaminho(arquivo.name)}`;
    await store.uploadFile(caminho, arquivo);
    return caminho;
  }
  async function criarAnexoDeArquivo(arquivo, idDoCard, itemId = null) {
    const caminho = await enviarArquivo(arquivo, idDoCard);
    try {
      await estado.criar('attachments', { card_id: idDoCard, item_id: itemId, kind: 'file', name: arquivo.name || 'arquivo', path: caminho });
    } catch (err) {
      store.removeFile(caminho).catch(() => {});
      throw err;
    }
    return caminho;
  }
  async function colarImagem(reg, arquivo) {
    erro('');
    try {
      const idDoCard = reg.tabela === 'cards' ? reg.id : linhaDe(reg).card_id;
      const caminho = await criarAnexoDeArquivo(arquivo, idDoCard, reg.tabela === 'items' ? reg.id : null);
      const url = await store.signedUrl(caminho);
      reg.mapa[caminho] = url;
      return url;
    } catch (err) {
      erro(err.message || 'Não foi possível anexar a imagem.');
      throw err;
    }
  }
  async function abrirArquivo(caminho) {
    const janela = window.open('about:blank', '_blank');
    if (janela) janela.opener = null;
    try {
      const url = await store.signedUrl(caminho);
      if (janela) janela.location.href = url; else window.location.href = url;
    } catch (err) {
      janela?.close();
      erro(err.message || 'Não foi possível abrir o arquivo.');
    }
  }

  function linhaAnexo(a) {
    const excluirBtn = criar('button', { type: 'button', class: 'btn-icone', 'data-acao': 'excluir', 'aria-label': 'Excluir anexo', title: 'Excluir anexo', texto: '×' });
    excluirBtn.addEventListener('click', () => {
      if (!window.confirm('Excluir este anexo?')) return;
      tentar(async () => {
        await estado.excluir('attachments', a.id);
        // O arquivo sem linha só ocupa espaço; não vale travar a exclusão por isso.
        if (a.path) await store.removeFile(a.path).catch(() => {});
      });
    });
    let nome;
    const extras = [];
    if (a.kind === 'link' && enderecoValido(a.url)) {
      nome = criar('a', { class: 'anexo-nome', href: a.url, target: '_blank', rel: 'noopener noreferrer', texto: a.name });
    } else if (a.kind === 'file' && a.path) {
      nome = criar('button', { type: 'button', class: 'anexo-nome', texto: a.name });
      nome.addEventListener('click', () => abrirArquivo(a.path));
    } else {
      nome = criar('span', { class: 'anexo-nome', texto: a.name });
    }
    if (a.kind === 'pending') {
      const entrada = criar('input', { type: 'file', hidden: '', 'aria-label': `Anexar ${a.name}` });
      const anexar = criar('button', { type: 'button', class: 'btn', 'data-acao': 'reanexar', texto: 'Anexar' });
      anexar.addEventListener('click', () => entrada.click());
      entrada.addEventListener('change', () => {
        const arquivo = entrada.files[0];
        if (!arquivo) return;
        const idDoCard = cardId;
        tentar(async () => {
          const caminho = await enviarArquivo(arquivo, idDoCard);
          try {
            await estado.alterar('attachments', a.id, { kind: 'file', path: caminho, url: null, name: arquivo.name });
          } catch (err) {
            store.removeFile(caminho).catch(() => {});
            throw err;
          }
        }).finally(() => { entrada.value = ''; });
      });
      extras.push(criar('p', { class: 'anexo-aviso', texto: 'Arquivo do Trello: anexe de novo' }), anexar, entrada);
    }
    return criar('div', { class: `anexo anexo-${a.kind}`, 'data-anexo': a.id },
      criar('div', { class: 'anexo-linha' }, criar('span', { class: 'anexo-tipo', 'aria-hidden': 'true', texto: a.kind === 'link' ? '🔗' : '📎' }), nome, excluirBtn),
      ...(extras.length ? [criar('div', { class: 'anexo-pendente' }, ...extras)] : []));
  }

  function desenharAnexos() {
    const anexos = estado.dados.attachments.filter((a) => a.card_id === cardId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const assinatura = anexos.map((a) => `${a.id}|${a.kind}|${a.name}|${a.path}|${a.url}`).join(';');
    if (nodos.assinaturaAnexos === assinatura) return;
    nodos.assinaturaAnexos = assinatura;
    nodos.anexos.replaceChildren(...(anexos.length ? anexos.map(linhaAnexo) : [criar('p', { class: 'suave', texto: 'Nenhum anexo.' })]));
  }

  // ---- itens
  const linhas = new Map();
  const grupos = new Map();

  // Abrir as anotações de um item fecha as do item que estava aberto, depois de gravá-las.
  async function expandir(itemId, abrir) {
    const l = linhas.get(itemId);
    if (!l) return;
    const aberto = abrir ?? notasItem?.id !== itemId;
    if (notasItem && (!aberto || notasItem.id !== itemId)) {
      const anterior = notasItem;
      if (pendentes.has(chaveNota(anterior.reg)) && !(await descarregar(chaveNota(anterior.reg)))) return;
      if (notasItem !== anterior) return; // outra ação trocou o item enquanto gravava
      fecharNotasItem();
    }
    if (!aberto || notasItem) return;
    l.el.classList.add('aberto');
    l.expandir.setAttribute('aria-expanded', 'true');
    notasItem = { id: itemId, reg: montarNotas(l.notas, 'items', itemId) };
  }

  function criarLinha(id) {
    const atual = () => estado.dados.items.find((i) => i.id === id);
    const feito = criar('input', { type: 'checkbox', class: 'item-feito', 'aria-label': 'Feito' });
    const titulo = criar('input', { type: 'text', class: 'item-titulo', 'aria-label': 'Título do item', autocomplete: 'off' });
    const btn = (acao, texto, rotulo) => criar('button', { type: 'button', class: 'btn-icone item-acao', 'data-acao': acao, 'aria-label': rotulo, title: rotulo, texto });
    const expandirBtn = btn('expandir', '▾', 'Anotações do item');
    expandirBtn.setAttribute('aria-expanded', 'false');
    const subir = btn('subir', '↑', 'Subir item');
    const descer = btn('descer', '↓', 'Descer item');
    const excluir = btn('excluir', '×', 'Excluir item');
    const notas = criar('div', { class: 'item-notas' });
    const el = criar('div', { class: 'item', 'data-item': id },
      criar('div', { class: 'item-linha' }, feito, titulo, expandirBtn, subir, descer, excluir),
      criar('div', { class: 'item-detalhe' }, notas));

    feito.addEventListener('change', () => tentar(() => estado.alterar('items', id, {
      done: feito.checked, done_at: feito.checked ? new Date().toISOString() : null,
    })));
    const renomear = () => {
      const novo = titulo.value.trim();
      if (!novo) { titulo.value = atual().title; return; }
      if (novo !== atual().title) tentar(() => estado.alterar('items', id, { title: novo }));
    };
    titulo.addEventListener('change', renomear);
    titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titulo.blur(); } });
    expandirBtn.addEventListener('click', () => expandir(id));
    const mover = (delta) => tentar(async () => {
      const todos = itensDoCard();
      const item = todos.find((i) => i.id === id);
      const vizinhos = todos.filter((i) => i.group_name === item.group_name);
      const outro = vizinhos[vizinhos.indexOf(item) + delta];
      if (outro) await trocarPosicoes(estado, 'items', todos, item, outro);
    });
    subir.addEventListener('click', () => mover(-1));
    descer.addEventListener('click', () => mover(1));
    excluir.addEventListener('click', () => {
      if (!window.confirm('Excluir este item?')) return;
      descartar('items', id);
      if (notasItem?.id === id) fecharNotasItem();
      tentar(() => estado.excluir('items', id));
    });
    return { el, feito, titulo, notas, expandir: expandirBtn };
  }

  function criarGrupo(nome) {
    const lista = criar('div', { class: 'grupo-itens' });
    const campo = criar('input', { type: 'text', placeholder: 'Novo item', 'aria-label': 'Novo item', autocomplete: 'off' });
    const form = criar('form', { class: 'novo-item', novalidate: '' }, campo, criar('button', { type: 'submit', class: 'btn', texto: 'Adicionar' }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const titulo = campo.value.trim();
      if (!titulo) return;
      tentar(() => estado.criar('items', { card_id: cardId, group_name: nome, title: titulo, position: posicaoNoFim(itensDoCard()) }))
        .then((ok) => { if (ok && campo.value.trim() === titulo) campo.value = ''; });
    });
    const el = criar('div', { class: 'grupo', 'data-grupo': nome },
      ...(nome ? [criar('h3', { class: 'grupo-nome', texto: nome })] : []), lista, form);
    return { el, lista };
  }

  const mesmaOrdem = (pai, filhos) => pai.children.length === filhos.length && filhos.every((f, i) => pai.children[i] === f);
  const ordenarFilhos = (pai, filhos) => { if (!mesmaOrdem(pai, filhos)) pai.replaceChildren(...filhos); };

  // Reaproveita os elementos para não tirar o foco de quem está digitando num item.
  function desenharItens() {
    const itens = itensDoCard();
    const nomes = [...new Set(itens.map((i) => i.group_name))];
    if (!nomes.length) nomes.push('');
    const vivos = new Set(itens.map((i) => i.id));
    for (const [id, l] of linhas) if (!vivos.has(id)) { linhas.delete(id); l.el.remove(); }
    for (const [nome, g] of grupos) if (!nomes.includes(nome)) { grupos.delete(nome); g.el.remove(); }
    for (const nome of nomes) {
      if (!grupos.has(nome)) grupos.set(nome, criarGrupo(nome));
      const filhos = itens.filter((i) => i.group_name === nome).map((item) => {
        if (!linhas.has(item.id)) linhas.set(item.id, criarLinha(item.id));
        const l = linhas.get(item.id);
        l.feito.checked = item.done;
        if (document.activeElement !== l.titulo) l.titulo.value = item.title;
        return l.el;
      });
      ordenarFilhos(grupos.get(nome).lista, filhos);
    }
    ordenarFilhos(nodos.itens, nomes.map((n) => grupos.get(n).el));
  }

  // ---- categorias, lista e fixa
  // Uma tag por card e, se quiser, subtags dela (listas clicáveis; ver regras/tags.js).
  const idsDoCard = () => estado.dados.card_categories.filter((cc) => cc.card_id === cardId).map((cc) => cc.category_id);
  // Uma gravação de cada vez, e cada uma calcula a partir do estado mais novo: toques rápidos não se anulam.
  let filaCategorias = Promise.resolve();
  const gravarCategorias = (calcular) => {
    const id = cardId;
    filaCategorias = filaCategorias.then(() => tentar(() => {
      const atuais = estado.dados.card_categories.filter((cc) => cc.card_id === id).map((cc) => cc.category_id);
      const novas = calcular(atuais);
      return novas ? estado.definirCategorias(id, novas) : undefined;
    })).catch(() => {});
  };

  function opcoesDeTag() {
    const ids = idsDoCard();
    const { tagId } = categoriaDoCard(estado.dados.categories, ids);
    const tags = emOrdem(estado.dados.categories, { incluir: new Set(tagId ? [tagId] : []) }).filter((k) => !k.parent_id);
    return [{ id: '', conteudo: criar('span', { class: 'escolha-nada', texto: 'Sem tag' }), selecionada: !tagId },
      ...tags.map((k) => ({ id: k.id, conteudo: chipCategoria(k), selecionada: k.id === tagId }))];
  }

  function subtagsDaTag() {
    const ids = idsDoCard();
    const { tagId, subIds } = categoriaDoCard(estado.dados.categories, ids);
    if (!tagId) return { subs: [], marcadas: [] };
    const subs = emOrdem(estado.dados.categories, { incluir: new Set(subIds) }).filter((k) => k.parent_id === tagId);
    return { subs, marcadas: subIds };
  }

  function criarEscolhasDeCategoria() {
    const tag = criarEscolha({
      id: 'card-tag', rotulo: 'Tag', chave: 'cat',
      opcoes: opcoesDeTag,
      resumo: () => {
        const { tagId } = categoriaDoCard(estado.dados.categories, idsDoCard());
        const k = estado.dados.categories.find((x) => x.id === tagId);
        return k ? chipCategoria(k) : 'Escolher tag';
      },
      // A mesma tag de novo não muda nada (nem num card antigo com outras famílias).
      aoEscolher: (id) => gravarCategorias((atuais) =>
        ((id || null) === categoriaDoCard(estado.dados.categories, atuais).tagId ? null : trocarTag(id || null))),
    });
    const sub = criarEscolha({
      id: 'card-subtags', rotulo: 'Subtags', chave: 'cat', multipla: true,
      opcoes: () => {
        const { subs, marcadas } = subtagsDaTag();
        return subs.map((k) => ({ id: k.id, conteudo: chipCategoria(k), selecionada: marcadas.includes(k.id) }));
      },
      resumo: () => {
        const { subs, marcadas } = subtagsDaTag();
        const nomes = subs.filter((k) => marcadas.includes(k.id)).map((k) => k.name);
        return nomes.length ? criar('span', { texto: nomes.join(', ') }) : 'Nenhuma';
      },
      aoEscolher: (id) => gravarCategorias((atuais) => alternarSubtag(estado.dados.categories, atuais, id)),
    });
    return { tag, sub };
  }

  function desenharCategorias() {
    const { outras } = categoriaDoCard(estado.dados.categories, idsDoCard());
    nodos.escolhaTag.atualizar();
    nodos.escolhaSub.atualizar();
    const semSub = !subtagsDaTag().subs.length;
    if (semSub) nodos.escolhaSub.fechar();
    nodos.escolhaSub.el.hidden = semSub;
    const nomes = outras.map((id) => estado.dados.categories.find((k) => k.id === id)).filter(Boolean)
      .map((k) => nomeCompleto(estado.dados.categories, k));
    nodos.tagOutras.hidden = !nomes.length;
    nodos.tagOutras.textContent = nomes.length ? `Também neste card: ${nomes.join(', ')}` : '';
  }

  const opcoesDeLista = (select) => select.replaceChildren(...[...estado.dados.lists].sort((a, b) => a.position - b.position)
    .map((l) => criar('option', { value: l.id, texto: l.name })));

  function desenharLista(c) {
    nodos.blocoLista.hidden = c.is_fixed;
    if (c.is_fixed) return;
    const assinatura = estado.dados.lists.map((l) => `${l.id}|${l.name}|${l.position}`).join(';') + (c.list_id ? '' : '|sem');
    if (nodos.assinaturaListas !== assinatura) {
      nodos.assinaturaListas = assinatura;
      opcoesDeLista(nodos.lista);
      if (!c.list_id) nodos.lista.prepend(criar('option', { value: '', texto: 'Sem lista' }));
    }
    nodos.lista.value = c.list_id || '';
  }

  function desenharFixa(c) {
    const el = nodos.fixa;
    if (c.is_fixed) {
      const nomes = DIAS.filter(([n]) => c.fixed_days.includes(n)).map(([, t]) => t);
      const select = criar('select', { id: 'card-voltar-lista', 'aria-label': 'Lista de destino' });
      opcoesDeLista(select);
      const voltar = criar('button', { type: 'button', class: 'btn', id: 'card-voltar', texto: 'Voltar ao quadro' });
      voltar.disabled = !estado.dados.lists.length;
      voltar.addEventListener('click', () => tentar(() => {
        const listaId = select.value;
        return moverCard(estado, c, listaId, posicaoNoFim(cardsDaLista(estado, listaId)), { is_fixed: false, fixed_days: [] });
      }));
      el.replaceChildren(
        criar('p', { class: 'suave', texto: nomes.length ? `Card fixo: ${nomes.join(', ')}` : 'Card fixo, sem dia da semana' }),
        criar('label', { class: 'campo' }, criar('span', { texto: 'Voltar para a lista' }), select), voltar);
      return;
    }
    const botao = criar('button', { type: 'button', class: 'btn', id: 'card-fixa', texto: 'Repetir toda semana' });
    const painel = criar('div', { class: 'painel-fixa', hidden: '' }, criar('p', { class: 'suave', texto: 'Dias da semana (opcional):' }));
    painel.hidden = !painelFixa;
    const grade = criar('div', { class: 'dias-fixa', id: 'card-fixa-dias' }, ...DIAS.map(([n, t]) => {
      const b = criar('button', { type: 'button', class: 'chip', 'data-dia': n, 'aria-pressed': String(dias.has(n)), texto: t });
      b.classList.toggle('ativo', dias.has(n));
      b.addEventListener('click', () => {
        if (dias.has(n)) dias.delete(n); else dias.add(n);
        b.classList.toggle('ativo', dias.has(n));
        b.setAttribute('aria-pressed', String(dias.has(n)));
      });
      return b;
    }));
    const confirmar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'card-fixa-confirmar', texto: 'Confirmar' });
    confirmar.addEventListener('click', () => tentar(async () => {
      painelFixa = false;
      await estado.alterar('cards', c.id, { is_fixed: true, fixed_days: [...dias].sort((a, b) => a - b), list_id: null, completed_at: null });
    }));
    painel.append(grade, confirmar);
    botao.addEventListener('click', () => { painelFixa = !painelFixa; painel.hidden = !painelFixa; });
    el.replaceChildren(criar('div', { class: 'agenda-linha' }, botao,
      criar('p', { class: 'suave', texto: 'Vira um card fixo, nos dias que você escolher.' })), painel);
  }

  // Flashcards deste card: estudados só aqui (os baralhos do menu são outra coisa).
  function desenharFlash(c) {
    const fs = estado.dados.flashcards.filter((f) => f.card_id === c.id).sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)));
    const hoje = paraHoje(estado.dados, hojeDoApp(estado), estado.ajustes()).porCard.get(c.id) || { novos: 0, revisar: 0 };
    const n = hoje.novos + hoje.revisar;
    nodos.flashEstudar.textContent = `Estudar (${n})`;
    nodos.flashEstudar.disabled = !n;
    nodos.flashResumo.textContent = fs.length ? `${fs.length} ${fs.length === 1 ? 'flashcard' : 'flashcards'}` : 'Crie perguntas e respostas sobre este card para estudar com repetição espaçada.';
    nodos.flashLista.replaceChildren(...fs.map((f) => itemDeFlash(estado, f)));
  }

  // Registros do diário dos blocos deste card; tocar abre o bloco.
  function desenharDiario(c) {
    const registros = registrosDoDiario(estado.dados, { cardId: c.id });
    nodos.diarioCard.replaceChildren(...(registros.length
      ? registros.map((r) => itemDoDiario(r, { comData: true, aoAbrir: () => abrirBloco(r.bloco) }))
      : [criar('p', { class: 'suave', texto: 'Ao marcar um bloco deste card como cumprido, escreva o que estudou: aparece aqui.' })]));
  }

  function desenharMeta(c) {
    const meta = c.meta_min || 0;
    if (document.activeElement !== nodos.metaH && document.activeElement !== nodos.metaM) {
      nodos.metaH.value = meta ? String(Math.floor(meta / 60)) : '';
      nodos.metaM.value = meta % 60 ? String(meta % 60) : '';
    }
    const h = horasDoCard(c.id, estado.dados, agoraNoFuso(Date.now(), estado.ajustes().fuso).data);
    nodos.metaTexto.textContent = `Planejadas ${formatarHoras(h.planejado_min)} · Cumpridas ${formatarHoras(h.cumprido_min)}${meta ? ` / meta ${formatarHoras(meta)}` : ''}`;
    nodos.metaBarra.hidden = !meta;
    nodos.metaBarraFill.style.width = meta ? `${Math.min(100, Math.round((h.cumprido_min / meta) * 100))}%` : '0%';
  }

  function atualizar() {
    const c = card();
    if (!c) { ocultar(); return; }
    if (document.activeElement !== nodos.titulo) nodos.titulo.value = c.title;
    const { feitos, total } = progresso(c.id, itensDoCard());
    nodos.progressoCaixa.hidden = !total;
    nodos.progresso.textContent = `${feitos} de ${total}`;
    nodos.barra.style.width = total ? `${Math.round((feitos / total) * 100)}%` : '0%';
    desenharCategorias();
    desenharLista(c);
    // O bloco de "fixa" só é refeito quando muda o que ele mostra (não ao digitar em outro lugar).
    const chaveFixa = `${c.is_fixed}|${c.fixed_days}|${estado.dados.lists.map((l) => l.id + l.name)}`;
    if (nodos.chaveFixa !== chaveFixa) { nodos.chaveFixa = chaveFixa; desenharFixa(c); }
    nodos.arquivar.textContent = c.archived ? 'Desarquivar' : 'Arquivar';
    desenharMeta(c);
    desenharDiario(c);
    desenharFlash(c);
    const textoRev = textoDasRevisoes(estado.dados.revisoes, c.id);
    nodos.revisoesTexto.textContent = textoRev || '';
    nodos.revisoesTexto.hidden = !textoRev;
    nodos.revisoesCancelar.hidden = !estado.dados.revisoes.some((r) => r.card_id === c.id && r.status === 'pendente');
    desenharItens();
    desenharAnexos();
  }

  // ---- montagem
  function montar(c) {
    linhas.clear(); grupos.clear();
    painelFixa = false; dias = new Set();
    const fecharBtn = criar('button', { type: 'button', class: 'btn-icone', id: 'card-fechar', 'aria-label': 'Fechar', title: 'Fechar', texto: '←' });
    const titulo = criar('input', { type: 'text', id: 'card-titulo', 'aria-label': 'Título do card', autocomplete: 'off' });
    const barra = criar('span');
    const progresso = criar('span', { id: 'card-progresso' });
    const progressoCaixa = criar('div', { class: 'card-progresso' }, progresso, criar('span', { class: 'barra-mini' }, barra));
    const { tag: escolhaTag, sub: escolhaSub } = criarEscolhasDeCategoria();
    const tagOutras = criar('p', { class: 'suave', id: 'card-tag-outras', hidden: '' });
    const lista = criar('select', { id: 'card-lista', 'aria-label': 'Lista do card' });
    const blocoLista = criar('label', { class: 'campo' }, criar('span', { texto: 'Lista' }), lista);
    const fixa = criar('div', { id: 'card-estado-fixa' });
    const agendar = criar('button', { type: 'button', class: 'btn', id: 'card-sessao', texto: 'Marcar sessão' });
    const revisaoBtn = criar('button', { type: 'button', class: 'btn', id: 'card-revisao' }, criar('i', { class: 'ti ti-repeat', 'aria-hidden': 'true' }), ' Revisões espaçadas');
    revisaoBtn.addEventListener('click', () => abrirAgendarRevisao(estado, cardId));
    const revisoesTexto = criar('div', { id: 'card-revisoes-texto', class: 'suave', hidden: '' });
    const revisoesCancelar = criar('button', { type: 'button', class: 'btn btn-mini', id: 'card-revisoes-cancelar', texto: 'Cancelar as que faltam', hidden: '' });
    revisoesCancelar.addEventListener('click', () => tentar(() => cancelarRevisoes(estado, cardId)));
    const notas = criar('div', { id: 'card-notas' });
    const itens = criar('div', { id: 'card-itens' });
    const novoGrupoBtn = criar('button', { type: 'button', class: 'btn', id: 'card-novo-grupo', texto: 'Novo grupo' });
    const grupoNome = criar('input', { id: 'novo-grupo-nome', type: 'text', placeholder: 'Nome do grupo', 'aria-label': 'Nome do grupo', autocomplete: 'off' });
    const grupoItem = criar('input', { id: 'novo-grupo-item', type: 'text', placeholder: 'Primeiro item', 'aria-label': 'Primeiro item do grupo', autocomplete: 'off' });
    const grupoForm = criar('form', { id: 'novo-grupo-form', class: 'novo-grupo', novalidate: '', hidden: '' }, grupoNome, grupoItem,
      criar('button', { type: 'submit', class: 'btn btn-principal', id: 'novo-grupo-criar', texto: 'Criar grupo' }));
    const arquivar = criar('button', { type: 'button', class: 'btn', id: 'card-arquivar' });
    const excluir = criar('button', { type: 'button', class: 'btn perigo', id: 'card-excluir', texto: 'Excluir card' });
    const erroEl = criar('div', { class: 'erro', id: 'card-erro', role: 'alert' });
    const salvar = criar('span', { id: 'card-salvar', class: 'card-salvar', 'aria-live': 'polite' });
    const anexos = criar('div', { id: 'card-anexos' });
    const diarioCard = criar('div', { id: 'card-diario', class: 'diario-lista' });
    const flashEstudar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'card-flash-estudar' });
    // Ao sair da sessão, volta para este card (por cima do Quadro).
    flashEstudar.addEventListener('click', async () => {
      const id = cardId; // fechar() limpa o card aberto
      await fechar();
      estudar({ cardId: id }, () => { irParaTela('quadro'); abrirCard(id); });
    });
    const flashAdicionar = criar('button', { type: 'button', class: 'btn', id: 'card-flash-adicionar' }, criar('i', { class: 'ti ti-plus', 'aria-hidden': 'true' }), ' Adicionar');
    flashAdicionar.addEventListener('click', () => abrirFormularioFlash(estado, { cardId }));
    const flashLista = criar('div', { class: 'flash-lista' });
    const flashResumo = criar('p', { class: 'suave' });
    const metaH = criar('input', { id: 'card-meta-h', type: 'number', min: '0', max: '9999', inputmode: 'numeric', 'aria-label': 'Meta em horas' });
    const metaM = criar('input', { id: 'card-meta-m', type: 'number', min: '0', max: '59', step: '5', inputmode: 'numeric', 'aria-label': 'Meta em minutos' });
    const metaTexto = criar('div', { id: 'card-meta-texto', class: 'suave' });
    const metaBarraFill = criar('span');
    const metaBarra = criar('span', { class: 'barra-mini card-meta-barra' }, metaBarraFill);
    const arquivoEntrada = criar('input', { type: 'file', id: 'anexo-arquivo', hidden: '', 'aria-label': 'Arquivo para anexar' });
    const anexarBtn = criar('button', { type: 'button', class: 'btn', id: 'anexo-arquivo-abrir', texto: 'Anexar arquivo' });
    const linkAbrir = criar('button', { type: 'button', class: 'btn', id: 'anexo-link-abrir', texto: 'Adicionar link' });
    const linkNome = criar('input', { id: 'anexo-link-nome', type: 'text', placeholder: 'Nome (opcional)', 'aria-label': 'Nome do link', autocomplete: 'off' });
    const linkUrl = criar('input', { id: 'anexo-link-url', type: 'url', placeholder: 'https://…', 'aria-label': 'Endereço do link', autocomplete: 'off', inputmode: 'url' });
    const linkForm = criar('form', { id: 'anexo-link-form', class: 'novo-grupo', novalidate: '', hidden: '' }, linkNome, linkUrl,
      criar('button', { type: 'submit', class: 'btn btn-principal', id: 'anexo-link-salvar', texto: 'Salvar link' }));

    folha.replaceChildren(
      criar('header', { class: 'card-cabecalho' },
        criar('div', { class: 'card-cabecalho-linha' }, fecharBtn, titulo, salvar), progressoCaixa),
      criar('div', { class: 'card-corpo' },
        criar('section', { class: 'card-categoria' }, criar('h3', { texto: 'Categoria' }),
          criar('div', { class: 'card-escolhas' }, escolhaTag.el, escolhaSub.el), tagOutras),
        criar('section', {}, blocoLista),
        criar('section', { id: 'card-na-agenda', class: 'card-na-agenda' }, criar('h3', { texto: 'Na agenda' }),
          criar('div', { class: 'agenda-linha' }, agendar, criar('p', { class: 'suave', texto: 'Coloca este card num horário da agenda.' })),
          criar('div', { class: 'agenda-linha' }, revisaoBtn, criar('p', { class: 'suave', texto: 'Marca revisões em datas futuras, como 7 e 30 dias depois.' })),
          criar('div', { class: 'card-revisoes' }, revisoesTexto, revisoesCancelar),
          fixa),
        criar('section', {}, criar('h3', { texto: 'Meta de horas' }),
          criar('div', { class: 'tag-meta-campos' }, metaH, criar('span', { texto: 'h' }), metaM, criar('span', { texto: 'min' })),
          metaTexto, metaBarra),
        criar('section', {}, criar('h3', { texto: 'Anotações' }), notas),
        criar('section', {}, criar('h3', { texto: 'Itens' }), itens, criar('div', { class: 'linha-botoes' }, novoGrupoBtn), grupoForm),
        criar('section', { id: 'card-flash' }, criar('h3', { texto: 'Flashcards' }), flashResumo,
          criar('div', { class: 'linha-botoes' }, flashEstudar, flashAdicionar), flashLista),
        criar('section', {}, criar('h3', { texto: 'Diário' }), diarioCard),
        criar('section', {}, criar('h3', { texto: 'Anexos' }), anexos,
          criar('div', { class: 'linha-botoes' }, anexarBtn, linkAbrir), arquivoEntrada, linkForm),
        erroEl,
        criar('div', { class: 'card-acoes' }, arquivar, excluir)));
    nodos = { titulo, progresso, progressoCaixa, barra, escolhaTag, escolhaSub, tagOutras, lista, blocoLista, fixa, notas, itens, arquivar, erro: erroEl, salvar, anexos, metaH, metaM, metaTexto, metaBarra, metaBarraFill, diarioCard, revisoesTexto, revisoesCancelar, flashEstudar, flashLista, flashResumo };

    fecharBtn.addEventListener('click', fechar);
    // Meta do card em minutos: vazio ou zero = sem meta.
    const gravarMeta = () => {
      const total = Math.round(Number(metaH.value || 0) * 60 + Number(metaM.value || 0));
      if (!Number.isFinite(total) || total < 0) { erro('Meta inválida.'); return; }
      const novo = total || null;
      if (novo !== (card().meta_min ?? null)) tentar(() => estado.alterar('cards', cardId, { meta_min: novo }));
    };
    metaH.addEventListener('change', gravarMeta);
    metaM.addEventListener('change', gravarMeta);
    // Abre a folha de bloco de estudo com o card e o próximo item; a hora sugerida é a próxima hora cheia de hoje.
    agendar.addEventListener('click', () => {
      const agora = new Date();
      const a = estado.ajustes();
      let data = isoDe(agora);
      let inicio = Math.max(a.day_start_min, Math.ceil((agora.getHours() * 60 + agora.getMinutes() + 1) / 60) * 60);
      if (inicio + 60 > a.day_end_min) { data = somaDias(data, 1); inicio = a.day_start_min; }
      abrirBloco({ novo: true, kind: 'study', date: data, start_min: inicio, end_min: Math.min(inicio + 60, 1440), card_id: cardId, item_id: proximoItem(cardId, itensOrdenados(estado))?.id || null });
    });
    const renomear = () => {
      const novo = titulo.value.trim();
      if (!novo) { titulo.value = card().title; return; }
      if (novo !== card().title) tentar(() => estado.alterar('cards', cardId, { title: novo }));
    };
    titulo.addEventListener('change', renomear);
    titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titulo.blur(); } });
    lista.addEventListener('change', () => {
      if (!lista.value) return;
      tentar(() => moverCard(estado, card(), lista.value, posicaoNoFim(cardsDaLista(estado, lista.value).filter((x) => x.id !== cardId))));
    });
    notasCard = montarNotas(notas, 'cards', c.id);
    anexarBtn.addEventListener('click', () => arquivoEntrada.click());
    arquivoEntrada.addEventListener('change', () => {
      const arquivo = arquivoEntrada.files[0];
      if (!arquivo) return;
      const idDoCard = cardId;
      tentar(() => criarAnexoDeArquivo(arquivo, idDoCard)).finally(() => { arquivoEntrada.value = ''; });
    });
    linkAbrir.addEventListener('click', () => { linkForm.hidden = !linkForm.hidden; if (!linkForm.hidden) linkUrl.focus(); });
    linkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = linkUrl.value.trim();
      if (!enderecoValido(url)) { erro('Use um endereço que comece com http:// ou https://.'); return; }
      const nome = linkNome.value.trim() || url;
      if (await tentar(() => estado.criar('attachments', { card_id: cardId, kind: 'link', name: nome, url }))) {
        linkNome.value = ''; linkUrl.value = ''; linkForm.hidden = true;
      }
    });
    novoGrupoBtn.addEventListener('click', () => { grupoForm.hidden = !grupoForm.hidden; if (!grupoForm.hidden) grupoNome.focus(); });
    grupoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = grupoNome.value.trim();
      const titulo1 = grupoItem.value.trim();
      if (!nome || !titulo1) { erro('Informe o nome do grupo e o primeiro item.'); return; }
      tentar(() => estado.criar('items', { card_id: cardId, group_name: nome, title: titulo1, position: posicaoNoFim(itensDoCard()) }))
        .then((ok) => {
          // Só limpa se o usuário não mexeu nos campos enquanto gravava.
          if (ok && grupoNome.value.trim() === nome && grupoItem.value.trim() === titulo1) {
            grupoNome.value = ''; grupoItem.value = ''; grupoForm.hidden = true;
          }
        });
    });
    arquivar.addEventListener('click', async () => {
      const atual = card();
      if (atual.archived) { await tentar(() => restaurarCard(estado, atual)); return; }
      if (!(await descarregarTudo())) return;
      if (await tentar(() => estado.alterar('cards', cardId, { archived: true }))) ocultar();
    });
    excluir.addEventListener('click', async () => {
      if (!window.confirm('Excluir este card? Os blocos já passados continuam no calendário; os agendados daqui para frente serão apagados.')) return;
      const id = cardId;
      const hoje = isoDe(new Date());
      const ok = await tentar(async () => {
        for (const b of estado.dados.blocks.filter((x) => x.card_id === id && x.status === 'planned' && x.date >= hoje)) {
          await estado.excluir('blocks', b.id);
        }
        await estado.excluir('cards', id);
      });
      if (ok) {
        // Card e itens não existem mais: o que estava por gravar e os rascunhos deles vão junto.
        for (const chave of [...pendentes.keys()]) { const [t, x] = chave.split(':'); descartar(t, x); }
        apagarRascunho('cards', id);
        ocultar();
      }
    });
  }

  abrirImpl = async function abrir(id, opcoes = {}) {
    if (!estado.dados.cards.some((c) => c.id === id)) return;
    if (!(await descarregarTudo())) return;
    ocultar();
    cardId = id;
    // Visível antes de montar: o editor visual mede a largura da barra ao ser criado.
    folha.hidden = false;
    montar(card());
    atualizar();
    document.body.classList.add('sem-rolagem');
    folha.scrollTop = 0;
    if (opcoes.itemId && linhas.has(opcoes.itemId)) {
      expandir(opcoes.itemId, true);
      linhas.get(opcoes.itemId).el.scrollIntoView({ block: 'center' });
    }
  };

  document.addEventListener('keydown', (e) => {
    // Com a folha do bloco aberta por cima (botão "Marcar sessão"), o Esc é só dela.
    if (e.key !== 'Escape' || folha.hidden || document.querySelector('#folha-bloco')?.hidden === false) return;
    // Esc num título em edição confirma o título (o `change` grava) em vez de fechar o card.
    if (e.target.matches?.('#card-titulo, .item-titulo')) { e.target.blur(); return; }
    fechar();
  });
  estado.aoMudar(() => { if (cardId && !folha.hidden) atualizar(); });
}
