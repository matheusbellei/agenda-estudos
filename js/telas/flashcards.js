// Tela Flashcards (baralhos do menu), formulário de flashcard (também usado no card) e contador do menu.
import { registrarTela } from './casca.js';
import { criar } from './bloco.js';
import { abrirJanela } from './janela.js';
import { hojeDoApp } from './hoje-do-app.js';
import { estudar } from './flash-sessao.js';
import { marcacaoParaHtml, limparSaidaDoEditor } from '../regras/marcacao.js';
import { criarEditor } from '../editor.js';
import { paraHoje, validarFlashcard, pergunta, resposta } from '../regras/flash.js';
import { normalizar } from '../regras/busca.js';
import { arvoreDeBaralhos, contagemDoGrupo, destinosPossiveis, filhosAoExcluirGrupo, grupoQueDefineLimites } from '../regras/baralhos.js';

const TIPOS = [['basico', 'Frente e verso'], ['invertido', 'Frente e verso + invertido'], ['lacuna', 'Lacuna'], ['digitar', 'Digitar a resposta']];
const ROTULO_VERSO = { basico: 'Verso', invertido: 'Verso', lacuna: 'Observação (opcional)', digitar: 'Resposta exata' };
const AJUDA = {
  basico: 'Pergunta na frente, resposta no verso.',
  invertido: 'Gera também o cartão ao contrário (verso → frente).',
  lacuna: 'Marque as partes escondidas com {{ }}. Ex.: Yo {{tuve}} un perro.',
  digitar: 'Você digita a resposta; só conta como acerto se for exatamente igual, com acentos.',
};
const contar = (c) => [c.novos ? `${c.novos} ${c.novos === 1 ? 'novo' : 'novos'}` : '', c.revisar ? `${c.revisar} para revisar` : '']
  .filter(Boolean).join(' · ') || 'Nada para hoje';

// Criar ou editar um flashcard de um baralho ou de um card.
// Frente e verso usam o editor das Anotações só com Negrito, Itálico e Lista; a resposta do "digitar" é uma linha simples.
const BARRA_FLASH = [['bold', 'italic'], ['ul']];
export function abrirFormularioFlash(estado, { baralhoId = null, cardId = null, flashcard = null }) {
  // Cartão novo é sempre "Digitar a resposta". Cartão antigo de outro tipo mantém o seu tipo como opção, para poder ser editado.
  const tiposDoForm = TIPOS.filter(([v]) => v === 'digitar' || v === flashcard?.tipo);
  const tipo = criar('select', { id: 'flash-tipo' }, ...tiposDoForm.map(([v, r]) => criar('option', { value: v, texto: r })));
  tipo.value = flashcard?.tipo || 'digitar';
  const ajuda = criar('p', { class: 'suave flash-ajuda' });
  const caixaFrente = criar('div', { class: 'flash-editor notas-editor' });
  const caixaVerso = criar('div', { class: 'flash-editor notas-editor' });
  const respostaEl = criar('input', { type: 'text', id: 'flash-resposta', maxlength: '2000', autocomplete: 'off', spellcheck: 'false' });
  const ehDigitar = flashcard?.tipo === 'digitar';
  respostaEl.value = ehDigitar ? flashcard.verso || '' : '';
  const rotuloVerso = criar('span');
  const campoVerso = criar('div', { class: 'campo' }, rotuloVerso, caixaVerso);
  const campoResposta = criar('label', { class: 'campo' }, criar('span', { texto: ROTULO_VERSO.digitar }), respostaEl);
  const previa = criar('div', { id: 'flash-previa', class: 'flash-previa' });
  const campoPrevia = criar('div', { class: 'campo' }, criar('span', { texto: 'Prévia' }), previa);
  const erro = criar('div', { class: 'erro', id: 'flash-erro', role: 'alert' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'flash-salvar', texto: 'Salvar' });
  const cancelar = criar('button', { type: 'button', class: 'btn', texto: 'Cancelar' });
  const janela = abrirJanela('flash-janela', flashcard ? 'Editar flashcard' : 'Novo flashcard',
    ...(tiposDoForm.length > 1 ? [criar('label', { class: 'campo' }, criar('span', { texto: 'Tipo' }), tipo)] : []), ajuda,
    criar('div', { class: 'campo' }, criar('span', { texto: 'Frente' }), caixaFrente),
    campoVerso, campoResposta, campoPrevia,
    erro, criar('div', { class: 'linha-botoes' }, salvar, cancelar));
  const { fechar } = janela;
  // Os ids ficam no editor (modo visual: a caixa; modo simples: a própria caixa de texto).
  const frente = criarEditor(caixaFrente, { markdown: flashcard?.frente || '', barra: BARRA_FLASH, rotulo: 'Frente', id: 'flash-frente', alturaMin: '90px', aoMudar: () => atualizar() });
  const verso = criarEditor(caixaVerso, { markdown: ehDigitar ? '' : flashcard?.verso || '', barra: BARRA_FLASH, rotulo: 'Verso', id: 'flash-verso', alturaMin: '90px', aoMudar: () => atualizar() });
  if (!caixaFrente.querySelector('#flash-frente')) caixaFrente.id = 'flash-frente';
  if (!caixaVerso.querySelector('#flash-verso')) caixaVerso.id = 'flash-verso';
  janela.aoFechar = () => { frente.destruir(); verso.destruir(); };
  cancelar.addEventListener('click', fechar);

  const textoDe = (ed) => limparSaidaDoEditor(ed.markdown());
  const textoVerso = () => (tipo.value === 'digitar' ? respostaEl.value : textoDe(verso));
  function atualizar() {
    rotuloVerso.textContent = ROTULO_VERSO[tipo.value];
    ajuda.textContent = AJUDA[tipo.value];
    campoVerso.hidden = tipo.value === 'digitar';
    campoResposta.hidden = tipo.value !== 'digitar';
    // Com o editor já formatado, a prévia só serve para ver a lacuna escondida.
    campoPrevia.hidden = tipo.value !== 'lacuna';
    if (campoPrevia.hidden) return;
    const f = { tipo: tipo.value, frente: textoDe(frente), verso: textoVerso() };
    const r = resposta(f, 'frente');
    previa.innerHTML = `${marcacaoParaHtml(pergunta(f, 'frente'))}<hr>${marcacaoParaHtml(r.texto)}${r.observacao ? marcacaoParaHtml(r.observacao) : ''}`;
  }
  caixaFrente.addEventListener('input', atualizar);
  caixaVerso.addEventListener('input', atualizar);
  respostaEl.addEventListener('input', atualizar);
  tipo.addEventListener('change', atualizar);
  atualizar();
  (caixaFrente.querySelector('textarea, .toastui-editor-ww-container .ProseMirror') || tipo).focus();

  let ocupado = false;
  salvar.addEventListener('click', async () => {
    if (ocupado) return;
    const dados = { tipo: tipo.value, frente: textoDe(frente).trim(), verso: textoVerso().trim() };
    const problema = validarFlashcard(dados);
    if (problema) { erro.textContent = problema; return; }
    const ladoVerso = flashcard && estado.dados.flash_lados.find((l) => l.flashcard_id === flashcard.id && l.lado === 'verso');
    if (ladoVerso && dados.tipo !== 'invertido' && !window.confirm('O cartão ao contrário (verso → frente) perde o progresso. Continuar?')) return;
    ocupado = true; erro.textContent = '';
    try {
      if (flashcard) {
        await estado.alterar('flashcards', flashcard.id, dados);
        if (ladoVerso && dados.tipo !== 'invertido') await estado.excluir('flash_lados', ladoVerso.id);
      } else {
        await estado.criar('flashcards', { ...dados, baralho_id: baralhoId, card_id: cardId });
      }
      fechar();
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível salvar.';
    } finally { ocupado = false; }
  });
}

// Uma linha da lista de flashcards (baralho ou card).
export function itemDeFlash(estado, f) {
  const editar = criar('button', { type: 'button', class: 'btn-icone flash-editar', 'aria-label': 'Editar flashcard' }, criar('i', { class: 'ti ti-pencil', 'aria-hidden': 'true' }));
  const excluir = criar('button', { type: 'button', class: 'btn-icone flash-excluir', 'aria-label': 'Excluir flashcard' }, criar('i', { class: 'ti ti-trash', 'aria-hidden': 'true' }));
  editar.addEventListener('click', () => abrirFormularioFlash(estado, { flashcard: f }));
  excluir.addEventListener('click', async () => {
    if (!window.confirm('Excluir este flashcard?')) return;
    try { await estado.excluir('flashcards', f.id); } catch (err) { window.alert?.(err.message); }
  });
  const texto = criar('div', { class: 'flash-texto' });
  texto.innerHTML = marcacaoParaHtml(pergunta(f, 'frente'));
  const tipo = TIPOS.find(([v]) => v === f.tipo)?.[1] || '';
  return criar('div', { class: 'flash-item', 'data-flash': f.id }, criar('div', { class: 'flash-corpo' }, texto, criar('span', { class: 'suave flash-tipo', texto: tipo })), editar, excluir);
}

export function iniciarFlashcards({ estado }) {
  const secao = document.querySelector('#tela-flashcards');
  const contador = document.querySelector('#menu-flash-contador');
  let aberto = null; // id do baralho aberto

  const hoje = () => hojeDoApp(estado);

  function atualizarContador() {
    const total = paraHoje(estado.dados, hoje(), estado.ajustes()).total;
    if (!contador) return;
    contador.textContent = String(total);
    contador.setAttribute('aria-label', `${total} para hoje`);
    contador.hidden = !total;
  }

  // Grupos fechados neste aparelho (lista de ids).
  const CHAVE_FECHADOS = 'agenda-baralhos-fechados';
  const fechados = (() => { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_FECHADOS) || '[]')); } catch { return new Set(); } })();
  const guardarFechados = () => { try { localStorage.setItem(CHAVE_FECHADOS, JSON.stringify([...fechados])); } catch { /* sem armazenamento: só nesta sessão */ } };

  function itemDeBaralho(b, hojeTudo) {
    const n = estado.dados.flashcards.filter((f) => f.baralho_id === b.id).length;
    const c = hojeTudo.porBaralho.get(b.id) || { novos: 0, revisar: 0 };
    const nome = criar('button', { type: 'button', class: 'baralho-nome', texto: b.nome });
    nome.addEventListener('click', () => { aberto = b.id; desenhar(); });
    const estudarBtn = criar('button', { type: 'button', class: 'btn btn-principal baralho-estudar', texto: 'Estudar' });
    estudarBtn.disabled = !(c.novos + c.revisar);
    estudarBtn.addEventListener('click', () => estudar({ baralhoId: b.id }, 'flashcards'));
    return criar('div', { class: 'cartao baralho-item', 'data-baralho': b.id },
      criar('div', { class: 'baralho-info' }, nome, criar('span', { class: 'suave', texto: `${n} ${n === 1 ? 'flashcard' : 'flashcards'}` }),
        criar('span', { class: 'baralho-contagem', texto: contar(c) })), estudarBtn);
  }

  function itemDeGrupo(no, hojeTudo) {
    const g = no.baralho;
    const aberto = !fechados.has(g.id);
    const c = contagemDoGrupo(estado.dados.baralhos, hojeTudo.porBaralho, g.id);
    const filhos = criar('div', { class: 'baralho-filhos', id: `grupo-filhos-${g.id}` },
      ...(no.filhos.length ? no.filhos.map((f) => itemDaArvore(f, hojeTudo)) : [criar('p', { class: 'suave', texto: 'Grupo vazio. Escolha este grupo em "Dentro do grupo" nos ajustes de um baralho.' })]));
    filhos.hidden = !aberto;
    const abrir = criar('button', { type: 'button', class: 'btn-icone grupo-abrir', 'aria-expanded': String(aberto), 'aria-controls': `grupo-filhos-${g.id}`, 'aria-label': `${aberto ? 'Fechar' : 'Abrir'} o grupo ${g.nome}` },
      criar('i', { class: `ti ti-chevron-${aberto ? 'down' : 'right'}`, 'aria-hidden': 'true' }));
    abrir.addEventListener('click', () => {
      if (fechados.has(g.id)) fechados.delete(g.id); else fechados.add(g.id);
      guardarFechados(); desenhar();
      secao.querySelector(`.baralho-grupo[data-baralho="${g.id}"] > .baralho-grupo-linha .grupo-abrir`)?.focus();
    });
    const nome = criar('button', { type: 'button', class: 'baralho-nome grupo-nome' }, criar('i', { class: 'ti ti-folder', 'aria-hidden': 'true' }), ` ${g.nome}`);
    nome.addEventListener('click', () => editarGrupo(g));
    const estudarBtn = criar('button', { type: 'button', class: 'btn btn-principal grupo-estudar', texto: 'Estudar' });
    estudarBtn.disabled = !(c.novos + c.revisar);
    estudarBtn.addEventListener('click', () => estudar({ grupoId: g.id }, 'flashcards'));
    return criar('div', { class: 'baralho-grupo', 'data-baralho': g.id },
      criar('div', { class: 'cartao baralho-grupo-linha' }, abrir,
        criar('div', { class: 'baralho-info' }, nome, criar('span', { class: 'baralho-contagem', texto: contar(c) })), estudarBtn),
      filhos);
  }

  const itemDaArvore = (no, hojeTudo) => (no.baralho.e_grupo ? itemDeGrupo(no, hojeTudo) : itemDeBaralho(no.baralho, hojeTudo));

  function lista() {
    const novo = criar('button', { type: 'button', class: 'btn btn-principal', id: 'flash-novo-baralho' }, criar('i', { class: 'ti ti-plus', 'aria-hidden': 'true' }), ' Novo baralho');
    novo.addEventListener('click', criarBaralho);
    const novoGrupo = criar('button', { type: 'button', class: 'btn', id: 'flash-novo-grupo' }, criar('i', { class: 'ti ti-folder-plus', 'aria-hidden': 'true' }), ' Novo grupo');
    novoGrupo.addEventListener('click', () => editarGrupo(null));
    const hojeTudo = paraHoje(estado.dados, hoje(), estado.ajustes());
    const itens = arvoreDeBaralhos(estado.dados.baralhos).map((no) => itemDaArvore(no, hojeTudo));
    // Os flashcards dos cards são estudados no próprio card; aqui só aparece o atalho para os que têm algo para hoje
    // (é o que o aviso e o contador também contam).
    const porCard = [...hojeTudo.porCard].filter(([, c]) => c.novos + c.revisar > 0);
    const doCards = porCard.map(([cardId, c]) => {
      const card = estado.dados.cards.find((x) => x.id === cardId);
      const estudarBtn = criar('button', { type: 'button', class: 'btn btn-principal flash-card-estudar', texto: 'Estudar' });
      estudarBtn.addEventListener('click', () => estudar({ cardId }, 'flashcards'));
      return criar('div', { class: 'flash-card-item', 'data-card': cardId },
        criar('div', { class: 'baralho-info' }, criar('b', { texto: card?.title || 'Card' }), criar('span', { class: 'baralho-contagem', texto: contar(c) })), estudarBtn);
    });
    secao.replaceChildren(criar('div', { class: 'linha-botoes' }, novo, novoGrupo),
      ...(itens.length ? itens : [criar('div', { class: 'cartao vazio', texto: 'Crie um baralho para estudar com flashcards. Os flashcards de cada card ficam dentro do próprio card.' })]),
      ...(doCards.length ? [criar('div', { class: 'cartao', id: 'flash-dos-cards' }, criar('h3', { texto: 'Flashcards dos cards para hoje' }), ...doCards)] : []));
  }

  // Criar (grupo = null) ou editar um grupo: nome, dentro de qual grupo e excluir.
  function editarGrupo(grupo) {
    const nome = criar('input', { id: 'grupo-nome', type: 'text', maxlength: '60', autocomplete: 'off' });
    nome.value = grupo?.nome || '';
    const pai = criar('select', { id: 'grupo-pai' }, criar('option', { value: '', texto: 'Nenhum' }),
      ...destinosPossiveis(estado.dados.baralhos, grupo?.id || '__novo__').map((g) => criar('option', { value: g.id, texto: g.nome })));
    pai.value = grupo?.pai_id || '';
    // Limites para os baralhos de dentro (sobrepõem os de cada baralho; o grupo mais de cima com limites manda).
    const limites = criar('input', { type: 'checkbox', id: 'grupo-limites' });
    limites.checked = !!grupo?.limites_do_grupo;
    const numero = (id, valor, max) => { const i = criar('input', { id, type: 'number', min: '0', max: String(max), step: '1', inputmode: 'numeric' }); i.value = String(valor); return i; };
    const novosG = numero('grupo-novos', grupo?.novos_dia ?? 20, 999);
    const revisoesG = numero('grupo-revisoes', grupo?.revisoes_dia ?? 200, 9999);
    const camposLimites = criar('div', { class: 'linha-campos' },
      criar('label', { class: 'campo' }, criar('span', { texto: 'Novos por dia' }), novosG),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Revisões por dia' }), revisoesG));
    // Um grupo de cima com limites manda: avisa que estes não valem.
    const deCima = grupo && grupoQueDefineLimites(estado.dados.baralhos, grupo.id);
    const avisoDeCima = criar('p', { class: 'aviso-sobreposto', id: 'grupo-sobreposto', hidden: '' });
    if (deCima) { avisoDeCima.hidden = false; avisoDeCima.textContent = `Os limites do grupo ${deCima.nome} valem no lugar destes (o grupo mais de cima manda).`; }
    const mostrarLimites = () => { camposLimites.hidden = !limites.checked; };
    limites.addEventListener('change', mostrarLimites);
    mostrarLimites();
    const erro = criar('div', { class: 'erro', id: 'grupo-erro', role: 'alert' });
    const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'grupo-salvar', texto: grupo ? 'Salvar' : 'Criar grupo' });
    const excluir = criar('button', { type: 'button', class: 'btn perigo', id: 'grupo-excluir', texto: 'Excluir grupo' });
    excluir.hidden = !grupo;
    const { fechar } = abrirJanela('grupo-janela', grupo ? 'Grupo de baralhos' : 'Novo grupo',
      criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Dentro do grupo' }), pai),
      criar('label', { class: 'campo-check' }, limites, criar('span', { texto: 'Definir limites para os baralhos deste grupo' })),
      camposLimites, avisoDeCima,
      criar('p', { class: 'suave', texto: 'Valem para cada baralho de dentro, no lugar dos limites dele.' }),
      erro, criar('div', { class: 'linha-botoes' }, salvar, excluir));
    nome.focus();
    salvar.addEventListener('click', async () => {
      const texto = nome.value.trim();
      if (!texto) { erro.textContent = 'Dê um nome ao grupo.'; return; }
      if (estado.dados.baralhos.some((b) => b.id !== grupo?.id && b.nome.trim().toLowerCase() === texto.toLowerCase())) { erro.textContent = 'Já existe um baralho ou grupo com esse nome.'; return; }
      try {
        // Campo vazio não vale como 0.
        const n = novosG.value.trim() === '' ? NaN : Number(novosG.value); const r = revisoesG.value.trim() === '' ? NaN : Number(revisoesG.value);
        if (limites.checked && (!Number.isInteger(n) || n < 0 || n > 999 || !Number.isInteger(r) || r < 0 || r > 9999)) {
          erro.textContent = 'Use de 0 a 999 novos e de 0 a 9999 revisões por dia.'; return;
        }
        const dados = { nome: texto, pai_id: pai.value || null, limites_do_grupo: limites.checked, ...(limites.checked ? { novos_dia: n, revisoes_dia: r } : {}) };
        if (grupo) await estado.alterar('baralhos', grupo.id, dados);
        else await estado.criar('baralhos', { ...dados, e_grupo: true });
        fechar();
      } catch (err) {
        erro.textContent = /registro igual/.test(err.message || '') ? 'Já existe um baralho ou grupo com esse nome.' : err.message || 'Não foi possível salvar.';
      }
    });
    excluir.addEventListener('click', async () => {
      if (!window.confirm(`Excluir o grupo "${grupo.nome}"? Os baralhos de dentro não são apagados: sobem um nível.`)) return;
      try {
        for (const f of filhosAoExcluirGrupo(estado.dados.baralhos, grupo.id)) await estado.alterar('baralhos', f.id, { pai_id: f.pai_id });
        await estado.excluir('baralhos', grupo.id);
        fechados.delete(grupo.id); guardarFechados();
        fechar();
      } catch (err) { erro.textContent = err.message || 'Não foi possível excluir.'; }
    });
  }

  function criarBaralho() {
    const nome = criar('input', { id: 'baralho-novo-nome', type: 'text', maxlength: '60', placeholder: 'Vocabulário de espanhol', autocomplete: 'off' });
    const erro = criar('div', { class: 'erro', role: 'alert' });
    const pai = criar('select', { id: 'baralho-novo-pai' }, criar('option', { value: '', texto: 'Nenhum' }),
      ...destinosPossiveis(estado.dados.baralhos, '__novo__').map((g) => criar('option', { value: g.id, texto: g.nome })));
    const criarBtn = criar('button', { type: 'button', class: 'btn btn-principal', id: 'baralho-criar', texto: 'Criar' });
    const { fechar } = abrirJanela('baralho-janela', 'Novo baralho', criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Dentro do grupo' }), pai), erro, criar('div', { class: 'linha-botoes' }, criarBtn));
    nome.focus();
    criarBtn.addEventListener('click', async () => {
      const texto = nome.value.trim();
      if (!texto) { erro.textContent = 'Dê um nome ao baralho.'; return; }
      if (estado.dados.baralhos.some((b) => b.nome.trim().toLowerCase() === texto.toLowerCase())) { erro.textContent = 'Já existe um baralho com esse nome.'; return; }
      try {
        const b = await estado.criar('baralhos', { nome: texto, pai_id: pai.value || null });
        aberto = b.id; fechar(); desenhar();
      } catch (err) {
        erro.textContent = /registro igual/.test(err.message || '') ? 'Já existe um baralho com esse nome.' : err.message || 'Não foi possível criar.';
      }
    });
  }

  let busca = '';
  let preencherLista = null;
  // Depois de salvar os ajustes: a tela é refeita com o painel aberto e o aviso "Ajustes salvos."
  let ajustesAbertos = false;
  let avisoSalvo = '';
  function baralho(b) {
    const voltar = criar('button', { type: 'button', class: 'btn', id: 'baralho-voltar' }, criar('i', { class: 'ti ti-arrow-left', 'aria-hidden': 'true' }), ' Baralhos');
    voltar.addEventListener('click', () => { aberto = null; desenhar(); });
    const c = paraHoje(estado.dados, hoje(), estado.ajustes()).porBaralho.get(b.id) || { novos: 0, revisar: 0 };
    const estudarBtn = criar('button', { type: 'button', class: 'btn btn-principal', id: 'baralho-estudar', texto: `Estudar (${c.novos + c.revisar})` });
    estudarBtn.disabled = !(c.novos + c.revisar);
    estudarBtn.addEventListener('click', () => estudar({ baralhoId: b.id }, 'flashcards'));
    const num = (id, valor, min, max, passo = '1') => { const i = criar('input', { id, type: 'number', min: String(min), max: String(max), step: passo, inputmode: 'decimal' }); i.value = String(valor); return i; };
    const nome = criar('input', { id: 'baralho-nome', type: 'text', maxlength: '60' }); nome.value = b.nome;
    const fator = num('baralho-fator', Number(b.fator), 1.3, 5, '0.1');
    const novos = num('baralho-novos', b.novos_dia, 0, 999);
    const revisoes = num('baralho-revisoes', b.revisoes_dia, 0, 9999);
    const pai = criar('select', { id: 'baralho-pai' }, criar('option', { value: '', texto: 'Nenhum' }),
      ...destinosPossiveis(estado.dados.baralhos, b.id).map((g) => criar('option', { value: g.id, texto: g.nome })));
    pai.value = b.pai_id || '';
    // Grupo com limites próprios: os campos ficam travados com o aviso de onde vêm os números.
    // Recalculado também ao trocar "Dentro do grupo" (antes de salvar), com o grupo escolhido.
    const sobreposto = criar('p', { class: 'aviso-sobreposto', id: 'baralho-sobreposto', hidden: '' });
    novos.setAttribute('aria-describedby', 'baralho-sobreposto');
    revisoes.setAttribute('aria-describedby', 'baralho-sobreposto');
    const travar = () => {
      const lista = estado.dados.baralhos.map((x) => (x.id === b.id ? { ...x, pai_id: pai.value || null } : x));
      const sobre = grupoQueDefineLimites(lista, b.id);
      novos.disabled = !!sobre; revisoes.disabled = !!sobre;
      sobreposto.hidden = !sobre;
      sobreposto.textContent = sobre ? `Definido pelo grupo ${sobre.nome}: ${sobre.novos_dia} novos e ${sobre.revisoes_dia} revisões por dia. Para mudar, abra o grupo.` : '';
    };
    pai.addEventListener('change', travar);
    travar();
    const erro = criar('div', { class: 'erro', id: 'baralho-erro', role: 'alert' });
    // O aviso entra vazio e o texto vem depois: assim o leitor de tela anuncia "Ajustes salvos."
    const salvo = criar('span', { class: 'baralho-salvo', id: 'baralho-salvo', role: 'status' });
    if (avisoSalvo) { const t = avisoSalvo; setTimeout(() => { salvo.textContent = t; }, 50); }
    avisoSalvo = '';
    const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'baralho-salvar', texto: 'Salvar' });
    const excluir = criar('button', { type: 'button', class: 'btn perigo', id: 'baralho-excluir', texto: 'Excluir baralho' });
    salvar.addEventListener('click', async () => {
      const vazioNaN = (i) => (i.value.trim() === '' ? NaN : Number(i.value));
      const f = vazioNaN(fator); const n = vazioNaN(novos); const r = vazioNaN(revisoes); const t = nome.value.trim();
      if (!t) { erro.textContent = 'Dê um nome ao baralho.'; return; }
      if (!(f >= 1.3 && f <= 5)) { erro.textContent = 'Use um fator de 1,3 a 5.'; return; }
      if (!Number.isInteger(n) || n < 0 || n > 999 || !Number.isInteger(r) || r < 0 || r > 9999) { erro.textContent = 'Use de 0 a 999 novos e de 0 a 9999 revisões por dia.'; return; }
      erro.textContent = ''; salvo.textContent = '';
      try {
        await estado.alterar('baralhos', b.id, { nome: t, fator: Math.round(f * 10) / 10, novos_dia: n, revisoes_dia: r, pai_id: pai.value || null });
        ajustesAbertos = true; avisoSalvo = 'Ajustes salvos.';
        const novo = estado.dados.baralhos.find((x) => x.id === b.id);
        if (novo && aberto === b.id) { baralho(novo); document.querySelector('#baralho-salvar')?.focus(); }
      } catch (err) { erro.textContent = /registro igual/.test(err.message || '') ? 'Já existe um baralho com esse nome.' : err.message || 'Não foi possível salvar.'; }
    });
    excluir.addEventListener('click', async () => {
      const n = estado.dados.flashcards.filter((f) => f.baralho_id === b.id).length;
      if (!window.confirm(`Excluir o baralho "${b.nome}"${n ? ` e os ${n} flashcards dele` : ''}?`)) return;
      try { await estado.excluir('baralhos', b.id); aberto = null; desenhar(); } catch (err) { erro.textContent = err.message || 'Não foi possível excluir.'; }
    });
    const campoBusca = criar('input', { id: 'flash-busca', type: 'search', placeholder: 'Buscar no baralho', autocomplete: 'off' });
    campoBusca.value = busca;
    const adicionar = criar('button', { type: 'button', class: 'btn', id: 'flash-adicionar' }, criar('i', { class: 'ti ti-plus', 'aria-hidden': 'true' }), ' Adicionar');
    adicionar.addEventListener('click', () => abrirFormularioFlash(estado, { baralhoId: b.id }));
    const listaEl = criar('div', { class: 'flash-lista' });
    const preencher = () => {
      const termo = normalizar(busca.trim());
      const fs = estado.dados.flashcards.filter((f) => f.baralho_id === b.id)
        .filter((f) => !termo || normalizar(`${f.frente} ${f.verso}`).includes(termo))
        .sort((x, y) => String(y.criado_em).localeCompare(String(x.criado_em)));
      listaEl.replaceChildren(...(fs.length ? fs.map((f) => itemDeFlash(estado, f)) : [criar('p', { class: 'suave', texto: termo ? 'Nada encontrado.' : 'Nenhum flashcard ainda.' })]));
    };
    campoBusca.addEventListener('input', () => { busca = campoBusca.value; preencher(); });
    preencher();
    preencherLista = preencher;
    secao.replaceChildren(criar('div', { id: 'baralho-tela', class: 'baralho-tela' },
      criar('div', { class: 'linha-botoes' }, voltar, estudarBtn),
      criar('h2', { texto: b.nome }), criar('p', { class: 'baralho-contagem', texto: contar(c) }),
      criar('div', { class: 'cartao' }, criar('div', { class: 'linha-botoes' }, campoBusca, adicionar), listaEl),
      criar('details', { class: 'cartao baralho-ajustes', ...(ajustesAbertos ? { open: '' } : {}) }, criar('summary', { texto: 'Ajustes do baralho' }),
        criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome),
        criar('label', { class: 'campo' }, criar('span', { texto: 'Dentro do grupo' }), pai),
        criar('div', { class: 'linha-campos' },
          criar('label', { class: 'campo' }, criar('span', { texto: 'Fator (acerto multiplica o intervalo)' }), fator),
          criar('label', { class: 'campo' }, criar('span', { texto: 'Novos por dia' }), novos),
          criar('label', { class: 'campo' }, criar('span', { texto: 'Revisões por dia' }), revisoes)),
        sobreposto,
        erro, criar('div', { class: 'linha-botoes' }, salvar, salvo, excluir))));
    ajustesAbertos = false;
    // Mexeu num campo depois de salvar: o aviso antigo sai.
    [nome, fator, novos, revisoes, pai].forEach((i) => i.addEventListener('input', () => { salvo.textContent = ''; }));
  }

  function desenhar() {
    if (secao.hidden) return;
    const b = aberto && estado.dados.baralhos.find((x) => x.id === aberto);
    if (!b) { aberto = null; preencherLista = null; lista(); return; }
    // Enquanto se digita nos ajustes ou na busca, só a lista é refeita (o campo não perde o foco).
    const digitando = document.activeElement?.matches?.('.baralho-ajustes input, .baralho-ajustes select') || document.activeElement?.id === 'flash-busca';
    if (digitando && preencherLista) { preencherLista(); return; }
    baralho(b);
  }

  // Pelo menu (ou ao voltar de uma sessão) abre sempre a lista de baralhos.
  registrarTela('flashcards', { mostrar: () => { busca = ''; aberto = null; desenhar(); } });
  estado.aoMudar(() => { atualizarContador(); desenhar(); });
  atualizarContador();
}
