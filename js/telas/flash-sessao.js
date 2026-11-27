// Sessão de estudo de flashcards (de um baralho ou de um card): pergunta, resposta, Errei/Acertei.
// Cada resposta grava na hora (sair no meio é seguro). Errados voltam no fim da sessão.
import { registrarTela, irPara } from './casca.js';
import { criar } from './bloco.js';
import { hojeDoApp } from './hoje-do-app.js';
import { marcacaoParaHtml } from '../regras/marcacao.js';
import { filaDaSessao, filaDoGrupo, limitesDe, responder, pergunta, resposta, confereDigitado } from '../regras/flash.js';

let iniciar = null;

// Abre a sessão: `alvo` = { baralhoId }, { grupoId } ou { cardId }; `voltar` = tela para onde "Sair" leva.
export function estudar(alvo, voltar = 'flashcards') {
  if (iniciar) iniciar(alvo, voltar);
  irPara('flash-sessao');
}

// Grava uma resposta: o lado (criado na primeira) e o resumo do dia (só na primeira resposta do lado no dia).
export async function gravarResposta(estado, item, acertou, hoje) {
  const fator = limitesDe(item.flashcard, { baralhos: estado.dados.baralhos, ajustes: estado.ajustes() }).fator;
  const atual = estado.dados.flash_lados.find((l) => l.flashcard_id === item.flashcard.id && l.lado === item.lado);
  const base = atual || { intervalo: 0, vence: null, errado_em: null, introduzido_em: null, revisado_em: null };
  const r = responder(base, acertou, { hoje, fator });
  const salvo = atual
    ? await estado.alterar('flash_lados', atual.id, r.patch)
    : await estado.criar('flash_lados', { flashcard_id: item.flashcard.id, lado: item.lado, ...r.patch });
  // O resumo do dia só alimenta os Dashboards: se falhar, a resposta (já gravada no lado) vale do mesmo jeito.
  if (r.primeiraDoDia) {
    try { await estado.somarDiaFlash(hoje, acertou); } catch (err) { console.warn('Resumo do dia dos flashcards não gravado:', err); }
  }
  return { salvo, primeiraDoDia: r.primeiraDoDia };
}

export function iniciarSessao({ estado }) {
  const secao = document.querySelector('#tela-flash-sessao');
  const titulo = criar('h2', { class: 'sessao-titulo' });
  const restantes = criar('div', { id: 'sessao-restantes', class: 'suave' });
  const perguntaEl = criar('div', { id: 'sessao-pergunta', class: 'sessao-texto sessao-pergunta' });
  const respostaEl = criar('div', { id: 'sessao-resposta', class: 'sessao-resposta', hidden: '' });
  const digitado = criar('input', { id: 'sessao-digitado', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Digite a resposta' });
  const conferir = criar('button', { type: 'button', class: 'btn btn-principal', id: 'sessao-conferir', texto: 'Conferir' });
  const caixaDigitar = criar('div', { class: 'sessao-digitar' }, digitado, conferir);
  const resultado = criar('div', { id: 'sessao-resultado', class: 'sessao-resultado', hidden: '' });
  const continuar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'sessao-continuar', texto: 'Continuar', hidden: '' });
  const mostrar = criar('button', { type: 'button', class: 'btn btn-principal sessao-grande', id: 'sessao-mostrar', texto: 'Mostrar resposta' });
  const errei = criar('button', { type: 'button', class: 'btn sessao-grande sessao-errei', id: 'sessao-errei', texto: 'Errei' });
  const acertei = criar('button', { type: 'button', class: 'btn sessao-grande sessao-acertei', id: 'sessao-acertei', texto: 'Acertei' });
  const botoes = criar('div', { class: 'sessao-botoes', hidden: '' }, errei, acertei);
  const erro = criar('div', { class: 'erro', id: 'sessao-erro', role: 'alert' });
  const resumo = criar('p', { class: 'sessao-resumo' });
  const fimVoltar = criar('button', { type: 'button', class: 'btn btn-principal', texto: 'Voltar' });
  const fim = criar('div', { id: 'sessao-fim', class: 'cartao sessao-fim', hidden: '' }, criar('h3', { texto: 'Sessão concluída' }), resumo, fimVoltar);
  const sair = criar('button', { type: 'button', class: 'btn', id: 'sessao-sair', texto: 'Sair' });
  const cartao = criar('div', { class: 'cartao sessao-cartao' }, perguntaEl, respostaEl, caixaDigitar, resultado, continuar, mostrar, botoes, erro);
  secao.replaceChildren(criar('div', { class: 'sessao-topo' }, titulo, restantes, sair), cartao, fim);

  let fila = []; let pos = 0; let voltarPara = 'flashcards';
  let revisados = 0; let acertosDePrimeira = 0; let ocupado = false; let hoje = '';
  let digitarResultado = null;

  const atual = () => fila[pos];
  const html = (el, texto) => { el.innerHTML = marcacaoParaHtml(texto); };

  function desenhar() {
    const item = atual();
    const n = fila.length - pos;
    restantes.textContent = `${n} ${n === 1 ? 'restante' : 'restantes'}`;
    cartao.hidden = !item; fim.hidden = !!item;
    if (!item) {
      const pct = revisados ? Math.round((acertosDePrimeira * 100) / revisados) : 0;
      resumo.textContent = revisados ? `${revisados} ${revisados === 1 ? 'revisado' : 'revisados'} · ${pct}% de acerto` : 'Nada para estudar agora.';
      return;
    }
    const ehDigitar = item.flashcard.tipo === 'digitar';
    html(perguntaEl, pergunta(item.flashcard, item.lado));
    respostaEl.hidden = true; respostaEl.replaceChildren();
    caixaDigitar.hidden = !ehDigitar; digitado.value = ''; digitado.disabled = false;
    resultado.hidden = true; continuar.hidden = true; digitarResultado = null;
    mostrar.hidden = ehDigitar; botoes.hidden = true; erro.textContent = '';
    if (ehDigitar) digitado.focus();
  }

  function revelar() {
    const item = atual();
    const r = resposta(item.flashcard, item.lado);
    const texto = criar('div', { class: 'sessao-texto' }); html(texto, r.texto);
    respostaEl.replaceChildren(texto);
    if (r.observacao && r.observacao.trim()) { const obs = criar('div', { class: 'sessao-obs suave' }); html(obs, r.observacao); respostaEl.append(obs); }
    respostaEl.hidden = false; mostrar.hidden = true; botoes.hidden = false;
  }

  async function responderAtual(acertou) {
    if (ocupado || !atual()) return;
    ocupado = true;
    const item = atual();
    hoje = hojeDoApp(estado); // sessão aberta passando da meia-noite grava no dia certo
    try {
      const { salvo, primeiraDoDia } = await gravarResposta(estado, item, acertou, hoje);
      if (primeiraDoDia) { revisados += 1; if (acertou) acertosDePrimeira += 1; }
      if (!acertou) fila.push({ ...item, registro: salvo });
      pos += 1;
      desenhar();
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível gravar a resposta. Tente de novo.';
    } finally { ocupado = false; }
  }

  mostrar.addEventListener('click', revelar);
  errei.addEventListener('click', () => responderAtual(false));
  acertei.addEventListener('click', () => responderAtual(true));
  const fazerConferencia = () => {
    if (digitarResultado || !digitado.value.trim()) return;
    const c = confereDigitado(digitado.value, atual().flashcard);
    digitarResultado = c;
    digitado.disabled = true;
    resultado.replaceChildren(
      criar('b', { class: c.acertou ? 'sessao-certo' : 'sessao-errado', texto: c.acertou ? 'Acertou' : 'Errou' }),
      criar('div', {}, criar('span', { class: 'suave', texto: 'Você: ' }), ...c.trechos.map((t) => criar('span', { class: t.igual ? '' : 'sessao-diferenca', texto: t.texto }))),
      criar('div', {}, criar('span', { class: 'suave', texto: 'Certa: ' }), criar('span', { texto: c.certa })));
    resultado.hidden = false; continuar.hidden = false; continuar.focus();
  };
  conferir.addEventListener('click', fazerConferencia);
  digitado.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fazerConferencia(); } });
  continuar.addEventListener('click', () => { if (digitarResultado) responderAtual(digitarResultado.acertou); });
  const voltar = () => { if (typeof voltarPara === 'function') voltarPara(); else irPara(voltarPara); };
  sair.addEventListener('click', voltar);
  fimVoltar.addEventListener('click', voltar);

  iniciar = (alvo, voltarTela) => {
    voltarPara = voltarTela;
    hoje = hojeDoApp(estado);
    const d = estado.dados;
    pos = 0; revisados = 0; acertosDePrimeira = 0;
    // Grupo: junta os baralhos de dentro, cada um com os próprios limites.
    if (alvo.grupoId) {
      titulo.textContent = d.baralhos.find((b) => b.id === alvo.grupoId)?.nome || 'Flashcards';
      fila = filaDoGrupo(d, alvo.grupoId, hoje, estado.ajustes());
      desenhar();
      return;
    }
    const flashcards = d.flashcards.filter((f) => (alvo.baralhoId ? f.baralho_id === alvo.baralhoId : f.card_id === alvo.cardId));
    const dono = alvo.baralhoId ? d.baralhos.find((b) => b.id === alvo.baralhoId) : d.cards.find((c) => c.id === alvo.cardId);
    titulo.textContent = dono ? (dono.nome || dono.title) : 'Flashcards';
    const limites = flashcards.length ? limitesDe(flashcards[0], { baralhos: d.baralhos, ajustes: estado.ajustes() }) : { novos: 0, revisoes: 0 };
    fila = filaDaSessao({ flashcards, lados: d.flash_lados, hoje, limites });
    pos = 0; revisados = 0; acertosDePrimeira = 0;
    desenhar();
  };
  registrarTela('flash-sessao', { mostrar: () => {} });
}
