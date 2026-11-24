// Tela Flashcards (baralhos do menu), formulário de flashcard (também usado no card) e contador do menu.
import { registrarTela } from './casca.js';
import { criar } from './bloco.js';
import { abrirJanela } from './janela.js';
import { hojeDoApp } from './revisoes.js';
import { estudar } from './flash-sessao.js';
import { marcacaoParaHtml } from '../regras/marcacao.js';
import { paraHoje, validarFlashcard, pergunta, resposta } from '../regras/flash.js';
import { normalizar } from '../regras/busca.js';

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
export function abrirFormularioFlash(estado, { baralhoId = null, cardId = null, flashcard = null }) {
  const tipo = criar('select', { id: 'flash-tipo' }, ...TIPOS.map(([v, r]) => criar('option', { value: v, texto: r })));
  tipo.value = flashcard?.tipo || 'basico';
  const ajuda = criar('p', { class: 'suave flash-ajuda' });
  const frente = criar('textarea', { id: 'flash-frente', rows: '3', maxlength: '2000' });
  const verso = criar('textarea', { id: 'flash-verso', rows: '3', maxlength: '2000' });
  frente.value = flashcard?.frente || ''; verso.value = flashcard?.verso || '';
  const rotuloVerso = criar('span');
  const previa = criar('div', { id: 'flash-previa', class: 'flash-previa' });
  const erro = criar('div', { class: 'erro', id: 'flash-erro', role: 'alert' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'flash-salvar', texto: 'Salvar' });
  const cancelar = criar('button', { type: 'button', class: 'btn', texto: 'Cancelar' });
  const { fechar } = abrirJanela('flash-janela', flashcard ? 'Editar flashcard' : 'Novo flashcard',
    criar('label', { class: 'campo' }, criar('span', { texto: 'Tipo' }), tipo), ajuda,
    criar('label', { class: 'campo' }, criar('span', { texto: 'Frente' }), frente),
    criar('label', { class: 'campo' }, rotuloVerso, verso),
    criar('p', { class: 'suave', texto: 'Formatação: **negrito**, *itálico*, linhas começando com "- " viram lista.' }),
    criar('div', { class: 'campo' }, criar('span', { texto: 'Prévia' }), previa),
    erro, criar('div', { class: 'linha-botoes' }, salvar, cancelar));
  cancelar.addEventListener('click', fechar);

  function atualizar() {
    rotuloVerso.textContent = ROTULO_VERSO[tipo.value];
    ajuda.textContent = AJUDA[tipo.value];
    const f = { tipo: tipo.value, frente: frente.value, verso: verso.value };
    const r = resposta(f, 'frente');
    previa.innerHTML = `${marcacaoParaHtml(pergunta(f, 'frente'))}<hr>${marcacaoParaHtml(r.texto)}${r.observacao ? marcacaoParaHtml(r.observacao) : ''}`;
  }
  [tipo, frente, verso].forEach((el) => el.addEventListener('input', atualizar));
  tipo.addEventListener('change', atualizar);
  atualizar();
  frente.focus();

  let ocupado = false;
  salvar.addEventListener('click', async () => {
    if (ocupado) return;
    const dados = { tipo: tipo.value, frente: frente.value.trim(), verso: verso.value.trim() };
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

  function lista() {
    const novo = criar('button', { type: 'button', class: 'btn btn-principal', id: 'flash-novo-baralho' }, criar('i', { class: 'ti ti-plus', 'aria-hidden': 'true' }), ' Novo baralho');
    novo.addEventListener('click', criarBaralho);
    const hojeTudo = paraHoje(estado.dados, hoje(), estado.ajustes());
    const baralhos = [...estado.dados.baralhos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const itens = baralhos.map((b) => {
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
    });
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
    secao.replaceChildren(criar('div', { class: 'linha-botoes' }, novo),
      ...(itens.length ? itens : [criar('div', { class: 'cartao vazio', texto: 'Crie um baralho para estudar com flashcards. Os flashcards de cada card ficam dentro do próprio card.' })]),
      ...(doCards.length ? [criar('div', { class: 'cartao', id: 'flash-dos-cards' }, criar('h3', { texto: 'Flashcards dos cards para hoje' }), ...doCards)] : []));
  }

  function criarBaralho() {
    const nome = criar('input', { id: 'baralho-novo-nome', type: 'text', maxlength: '60', placeholder: 'Vocabulário de espanhol', autocomplete: 'off' });
    const erro = criar('div', { class: 'erro', role: 'alert' });
    const criarBtn = criar('button', { type: 'button', class: 'btn btn-principal', id: 'baralho-criar', texto: 'Criar' });
    const { fechar } = abrirJanela('baralho-janela', 'Novo baralho', criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome), erro, criar('div', { class: 'linha-botoes' }, criarBtn));
    nome.focus();
    criarBtn.addEventListener('click', async () => {
      const texto = nome.value.trim();
      if (!texto) { erro.textContent = 'Dê um nome ao baralho.'; return; }
      if (estado.dados.baralhos.some((b) => b.nome.trim().toLowerCase() === texto.toLowerCase())) { erro.textContent = 'Já existe um baralho com esse nome.'; return; }
      try {
        const b = await estado.criar('baralhos', { nome: texto });
        aberto = b.id; fechar(); desenhar();
      } catch (err) {
        erro.textContent = /registro igual/.test(err.message || '') ? 'Já existe um baralho com esse nome.' : err.message || 'Não foi possível criar.';
      }
    });
  }

  let busca = '';
  let preencherLista = null;
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
    const erro = criar('div', { class: 'erro', id: 'baralho-erro', role: 'alert' });
    const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'baralho-salvar', texto: 'Salvar' });
    const excluir = criar('button', { type: 'button', class: 'btn perigo', id: 'baralho-excluir', texto: 'Excluir baralho' });
    salvar.addEventListener('click', async () => {
      const f = Number(fator.value); const n = Number(novos.value); const r = Number(revisoes.value); const t = nome.value.trim();
      if (!t) { erro.textContent = 'Dê um nome ao baralho.'; return; }
      if (!(f >= 1.3 && f <= 5)) { erro.textContent = 'Use um fator de 1,3 a 5.'; return; }
      if (!Number.isInteger(n) || n < 0 || n > 999 || !Number.isInteger(r) || r < 0 || r > 9999) { erro.textContent = 'Use de 0 a 999 novos e de 0 a 9999 revisões por dia.'; return; }
      erro.textContent = '';
      try { await estado.alterar('baralhos', b.id, { nome: t, fator: Math.round(f * 10) / 10, novos_dia: n, revisoes_dia: r }); }
      catch (err) { erro.textContent = /registro igual/.test(err.message || '') ? 'Já existe um baralho com esse nome.' : err.message || 'Não foi possível salvar.'; }
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
      criar('details', { class: 'cartao baralho-ajustes' }, criar('summary', { texto: 'Ajustes do baralho' }),
        criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome),
        criar('div', { class: 'linha-campos' },
          criar('label', { class: 'campo' }, criar('span', { texto: 'Fator (acerto multiplica o intervalo)' }), fator),
          criar('label', { class: 'campo' }, criar('span', { texto: 'Novos por dia' }), novos),
          criar('label', { class: 'campo' }, criar('span', { texto: 'Revisões por dia' }), revisoes)),
        erro, criar('div', { class: 'linha-botoes' }, salvar, excluir))));
  }

  function desenhar() {
    if (secao.hidden) return;
    const b = aberto && estado.dados.baralhos.find((x) => x.id === aberto);
    if (!b) { aberto = null; preencherLista = null; lista(); return; }
    // Enquanto se digita nos ajustes ou na busca, só a lista é refeita (o campo não perde o foco).
    const digitando = secao.querySelector('.baralho-ajustes')?.contains(document.activeElement) || document.activeElement?.id === 'flash-busca';
    if (digitando && preencherLista) { preencherLista(); return; }
    baralho(b);
  }

  // Pelo menu (ou ao voltar de uma sessão) abre sempre a lista de baralhos.
  registrarTela('flashcards', { mostrar: () => { busca = ''; aberto = null; desenhar(); } });
  estado.aoMudar(() => { atualizarContador(); desenhar(); });
  atualizarContador();
}
