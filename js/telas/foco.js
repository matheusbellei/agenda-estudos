// Modo foco (Pomodoro): uma fase por vez, guardada no Supabase para o aviso chegar com o app fechado.
// O foco nunca marca nada sozinho: só ao tocar em Parar, com um bloco ligado, pergunta se marca como cumprido.
import { registrarTela, irPara } from './casca.js';
import { lerFoco, gravarFoco, apagarFoco } from '../foco.js';
import { proximaFase, duracaoS, restanteS, iniciarFase, pausar, retomar, textoDoFim } from '../regras/foco.js';
import { blocosDoPeriodo } from '../regras/calendario.js';
import { refDoBloco } from '../regras/lembretes.js';
import { mudarEstado } from './bloco.js';

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

const NOMES = { foco: 'Foco', pausa: 'Pausa', pausa_longa: 'Pausa longa' };
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

let irComBloco = null;

// Chamado pela folha do bloco ("Focar"): leva o bloco para a tela de foco.
export function focarNoBloco(bloco) {
  irComBloco = { bloco_ref: refDoBloco(bloco), bloco_data: bloco.date, titulo: bloco.title || '' };
  irPara('foco');
}

function bipe() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.frequency.value = 880;
    ganho.gain.setValueAtTime(0.25, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.6);
  } catch { /* sem áudio: só a vibração e a tela */ }
}

export function iniciarFoco({ estado, store }) {
  const secao = document.querySelector('#tela-foco');
  let foco = null; // linha gravada (ou null)
  let ligado = null; // bloco escolhido antes de iniciar
  let relogio = null;
  let ocupado = false;

  const fase = criar('div', { id: 'foco-fase', class: 'foco-fase' });
  const tempo = criar('div', { id: 'foco-tempo', class: 'foco-tempo', 'aria-live': 'off' });
  const ciclo = criar('div', { id: 'foco-ciclo', class: 'suave' });
  const titulo = criar('div', { id: 'foco-titulo', class: 'foco-titulo' });
  const fimTexto = criar('p', { id: 'foco-fim-texto', class: 'foco-fim' });
  const botao = (id, texto, classe = 'btn') => criar('button', { type: 'button', class: classe, id, texto });
  const iniciarBtn = botao('foco-iniciar', 'Iniciar foco', 'btn btn-principal');
  const pausarBtn = botao('foco-pausar', 'Pausar', 'btn btn-principal');
  const retomarBtn = botao('foco-retomar', 'Retomar', 'btn btn-principal');
  const proximaBtn = botao('foco-proxima', '', 'btn btn-principal');
  const pularBtn = botao('foco-pular', 'Pular fase');
  const pararBtn = botao('foco-parar', 'Parar');
  const diario = criar('textarea', { id: 'foco-diario', rows: '3', placeholder: 'O que você estudou (opcional)' });
  const marcarBtn = botao('foco-marcar', 'Marcar como cumprido', 'btn btn-principal');
  const agoraNaoBtn = botao('foco-agora-nao', 'Agora não');
  const perguntar = criar('div', { id: 'foco-perguntar', class: 'cartao foco-perguntar', hidden: '' },
    criar('h3', { texto: 'Marcar o bloco como cumprido?' }),
    criar('label', { class: 'campo' }, criar('span', { texto: 'Diário' }), diario),
    criar('div', { class: 'linha-botoes' }, marcarBtn, agoraNaoBtn));
  const erro = criar('div', { class: 'erro', id: 'foco-erro', role: 'alert' });
  secao.replaceChildren(
    criar('div', { class: 'cartao foco-painel' }, titulo, fase, tempo, ciclo, fimTexto,
      criar('div', { class: 'linha-botoes foco-botoes' }, iniciarBtn, pausarBtn, retomarBtn, proximaBtn, pularBtn, pararBtn)),
    perguntar, erro);

  const ajustes = () => estado.ajustes();
  const textoCiclo = (n) => `Ciclo ${((n - 1) % ajustes().ciclos_longa) + 1} de ${ajustes().ciclos_longa}`;

  function desenhar() {
    const a = ajustes();
    const f = foco;
    const est = f?.estado || 'parado';
    titulo.textContent = (f?.titulo ?? ligado?.titulo ?? '') || '';
    titulo.hidden = !titulo.textContent;
    fase.textContent = NOMES[f?.fase || 'foco'];
    tempo.textContent = mmss(f ? restanteS(f, Date.now()) : duracaoS('foco', a));
    ciclo.textContent = textoCiclo(f?.ciclo || 1);
    const esperando = est === 'esperando';
    fimTexto.hidden = !esperando;
    if (esperando) {
      const t = textoDoFim(f, a);
      fimTexto.textContent = t.corpo; proximaBtn.textContent = t.botao;
    }
    iniciarBtn.hidden = est !== 'parado';
    pausarBtn.hidden = est !== 'rodando';
    retomarBtn.hidden = est !== 'pausado';
    proximaBtn.hidden = !esperando;
    pularBtn.hidden = est === 'parado' || esperando;
    pararBtn.hidden = est === 'parado';
  }

  // Grava a mudança. Se a linha mudou por fora (outro aparelho ou o botão da notificação), relê em vez de sobrescrever.
  async function salvar(nova, condicao = {}) {
    const antes = foco;
    foco = { ...(foco || {}), ...nova };
    desenhar();
    try {
      const gravada = await gravarFoco(store, antes, nova, condicao);
      if (gravada) { foco = { ...foco, ...gravada }; erro.textContent = ''; return true; }
      await recarregar();
      if (!foco) erro.textContent = 'O foco foi parado em outro aparelho.';
      return false;
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível salvar o foco.';
      return false;
    }
  }

  async function agir(fn) {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); } finally { ocupado = false; desenhar(); }
  }

  // Fim da fase com o app aberto e visível (em qualquer tela): bipe e vibração (se ligados), aviso fora da
  // tela Foco, e a linha passa a "esperando" — só se ainda for a mesma fase.
  let lendo = false;
  let avisadoPara = null;
  async function conferirFim() {
    if (lendo || document.hidden || foco?.estado !== 'rodando' || restanteS(foco, Date.now()) > 0) return;
    const fase = foco;
    // Só avisa se a fase ainda era esta (não foi avançada pela notificação nem por outro aparelho).
    if (await salvar({ estado: 'esperando' }, { termina_em: fase.termina_em })) avisarFim(fase);
  }

  function avisarFim(fase) {
    if (avisadoPara === fase.termina_em) return;
    avisadoPara = fase.termina_em;
    if (ajustes().foco_som) { bipe(); try { navigator.vibrate?.([300, 150, 300]); } catch { /* sem vibração */ } }
    if (secao.hidden) mostrarAviso(textoDoFim(fase, ajustes()).corpo);
  }

  const aviso = criar('div', { id: 'foco-aviso', class: 'foco-aviso', role: 'status', hidden: '' });
  const avisoTexto = criar('span');
  const avisoAbrir = criar('button', { type: 'button', class: 'btn btn-mini', id: 'foco-aviso-abrir', texto: 'Abrir' });
  aviso.append(avisoTexto, avisoAbrir);
  document.body.append(aviso);
  function mostrarAviso(texto) { avisoTexto.textContent = texto; aviso.hidden = false; }
  avisoAbrir.addEventListener('click', () => { aviso.hidden = true; irPara('foco'); });

  function tique() {
    conferirFim();
    if (!secao.hidden) desenhar();
  }

  async function recarregar() {
    lendo = true;
    try {
      foco = await lerFoco(store);
    } catch (err) {
      if (!secao.hidden) erro.textContent = err.message || 'Não foi possível ler o foco.';
      return;
    } finally { lendo = false; }
    if (irComBloco) {
      if (!foco) ligado = irComBloco;
      else if (!foco.bloco_ref) await salvar(irComBloco);
      irComBloco = null;
    }
    if (!relogio) relogio = setInterval(tique, 1000);
    // Fase que acabou com o app fechado: conferirFim passa a linha a "esperando" (o tique da função também grava).
    await conferirFim();
    if (!secao.hidden) desenhar();
  }

  async function mostrarTela() {
    aviso.hidden = true;
    perguntar.hidden = true;
    erro.textContent = '';
    await recarregar();
  }

  iniciarBtn.addEventListener('click', () => agir(() => salvar({
    ...iniciarFase('foco', 1, Date.now(), ajustes()), bloco_ref: ligado?.bloco_ref || null, bloco_data: ligado?.bloco_data || null, titulo: ligado?.titulo || '',
  })));
  pausarBtn.addEventListener('click', () => agir(() => salvar(pausar(foco, Date.now()))));
  retomarBtn.addEventListener('click', () => agir(() => salvar(retomar(foco, Date.now()))));
  const avancar = () => agir(() => { const p = proximaFase(foco, ajustes()); return salvar(iniciarFase(p.fase, p.ciclo, Date.now(), ajustes())); });
  proximaBtn.addEventListener('click', avancar);
  pularBtn.addEventListener('click', avancar);

  async function encerrar() {
    const antes = foco;
    foco = null; ligado = null;
    perguntar.hidden = true;
    try { await apagarFoco(store, antes); } catch (err) { erro.textContent = err.message || 'Não foi possível parar.'; }
  }
  pararBtn.addEventListener('click', () => agir(async () => {
    if (foco?.bloco_ref) { diario.value = ''; perguntar.hidden = false; diario.focus(); return; }
    await encerrar();
  }));
  agoraNaoBtn.addEventListener('click', () => agir(encerrar));
  marcarBtn.addEventListener('click', () => agir(async () => {
    const { bloco_ref: ref, bloco_data: data } = foco;
    const bloco = blocosDoPeriodo(estado.dados.commitments, estado.dados.blocks, data, data).find((b) => refDoBloco(b) === ref);
    if (!bloco) { erro.textContent = 'O bloco deste foco não existe mais. Toque em Agora não.'; return; }
    try {
      await mudarEstado(estado, bloco, 'done', { diario: diario.value });
    } catch (err) { erro.textContent = err.message || 'Não foi possível marcar o bloco.'; return; }
    await encerrar();
  }));

  // Voltar para o app, ou o aviso do service worker com o app na tela (qualquer tela), relê a linha.
  let dentro = false;
  document.addEventListener('visibilitychange', () => { if (dentro && !document.hidden) recarregar(); });
  // O service worker não mostrou o push porque o app está na tela: o app avisa, mesmo que a linha já esteja "esperando".
  navigator.serviceWorker?.addEventListener?.('message', async (e) => {
    if (!dentro || e.data?.tipo !== 'foco-fim') return;
    await recarregar();
    if (foco?.estado === 'esperando') avisarFim(foco);
  });

  registrarTela('foco', { mostrar: mostrarTela });
  // Chamado depois do login: o foco em andamento é vigiado em todas as telas.
  return {
    entrar: () => { dentro = true; return recarregar(); },
    sair: () => { dentro = false; clearInterval(relogio); relogio = null; foco = null; aviso.hidden = true; },
  };
}
