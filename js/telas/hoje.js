// Tela Hoje: um dia, com navegação entre dias.
import { mostrarSemana } from './semana.js';
import { registrarTela, irPara } from './casca.js';
import { criar, elementoBloco, abrirBloco, ligarCabecaECorpo, gravarBloco } from './bloco.js';
import { ajustarAFatia } from '../regras/calendario.js';
import { somaDias, isoDe, rotuloDia, horaTexto } from '../regras/datas.js';
import { blocosDoPeriodo, horariosLivres, limitesDoDia, posicionar, inicioMaisUmaHora } from '../regras/calendario.js';
import { montarFila, selecaoAtual, agendarSelecionada, agendarEntrada, umaHoraLivre, avisarSelecao } from './fila.js';

const PX_POR_MIN = 1.4;
// Recuo, por nível, de um bloco em cascata.
const RECUO_PX = 22;

let diaAtual = null;
let manterDia = false;

// Abre a tela Hoje no dia pedido (usado pelos nomes dos dias da Semana).
export function mostrarDia(iso) {
  diaAtual = iso;
  manterDia = true;
  irPara('hoje');
}

export function iniciarHoje({ estado }) {
  const secao = document.querySelector('#tela-hoje');
  const titulo = criar('h2', { id: 'dia-titulo' });
  const botao = (id, texto, rotulo) => criar('button', { type: 'button', class: 'btn', id, 'aria-label': rotulo, texto });
  const ant = botao('dia-ant', '‹', 'Dia anterior');
  const prox = botao('dia-prox', '›', 'Próximo dia');
  const hoje = botao('dia-hoje', 'Hoje', 'Voltar para hoje');
  ant.addEventListener('click', () => { diaAtual = somaDias(diaAtual, -1); desenhar(); });
  prox.addEventListener('click', () => { diaAtual = somaDias(diaAtual, 1); desenhar(); });
  hoje.addEventListener('click', () => { diaAtual = isoDe(new Date()); rolarParaAgora = null; desenhar(); });
  let rolarParaAgora = null; // o dia que já rolou para a hora atual
  // Sem o alternador Hoje/Semana: daqui se volta para a semana deste dia.
  const semana = criar('button', { type: 'button', class: 'btn', id: 'dia-semana', 'aria-label': 'Ver a semana deste dia' },
    criar('i', { class: 'ti ti-calendar-week', 'aria-hidden': 'true' }), ' Semana');
  semana.addEventListener('click', () => mostrarSemana(diaAtual));
  const topo = criar('div', { class: 'cal-topo' }, ant, titulo, hoje, prox, semana);
  const fila = criar('aside', { id: 'fila-hoje', class: 'fila' });
  const principal = criar('div', { class: 'cal-principal' }, topo);
  const aviso = criar('div', { class: 'erro', id: 'dia-aviso', role: 'alert' });
  const linha = criar('div', { class: 'linha-do-tempo' });
  principal.append(aviso, linha);
  secao.replaceChildren(criar('div', { class: 'cal-layout' }, principal, fila));

  let arrastando = false;
  let bloquearClique = false;

  let desenhado = { blocos: [], inicio: 0, fim: 1440, fatia: 30 }; // o que está na tela, para o toque e o arrasto da fila

  // Hora nova a partir do ponto `y` na linha do tempo (corpo de um bloco): fatia para baixo e uma hora.
  // `piso`: início do bloco tocado — o novo nunca começa antes dele.
  function horaNoPonto(y, piso = desenhado.inicio) {
    const bruto = desenhado.inicio + (y - linha.getBoundingClientRect().top) / PX_POR_MIN;
    const min = Math.max(desenhado.inicio, piso, Math.floor(bruto / desenhado.fatia) * desenhado.fatia);
    return inicioMaisUmaHora(min, desenhado.blocos, desenhado.fim);
  }

  // Uma hora a partir da fatia, sem entrar em bloco já marcado. Com item da fila escolhido, agenda direto.
  function novoNaFatia(ini, blocos, fim) {
    const hora = umaHoraLivre(ini, blocos, fim);
    if (!hora) { if (selecaoAtual()) avisarSelecao('Sem espaço livre neste horário.'); return; }
    if (selecaoAtual()) agendarSelecionada(estado, { date: diaAtual, ...hora });
    else abrirBloco({ novo: true, date: diaAtual, ...hora });
  }

  function soltarNaFatia(entrada, x, y) {
    const sob = document.elementFromPoint(x, y);
    const fatia = sob?.closest('.fatia');
    const tocado = sob?.closest('.linha-do-tempo .bloco');
    const hora = tocado ? horaNoPonto(y, Number(tocado.dataset.inicio) || desenhado.inicio)
      : fatia ? umaHoraLivre(Number(fatia.dataset.inicio), desenhado.blocos, desenhado.fim) : null;
    if (hora) agendarEntrada(estado, entrada, { date: diaAtual, ...hora });
  }

  async function gravarArrasto(bloco, patch) {
    aviso.textContent = '';
    try { await gravarBloco(estado, bloco, patch); } catch (err) { aviso.textContent = err.message || 'Não foi possível salvar.'; desenhar(); }
  }

  // Arrastar o bloco muda o início (mantém a duração); a alça muda o fim. Ambos encaixam em day_slot_min.
  // No toque o arrasto só começa após 300 ms parado; o caminho sem arrastar é a folha do bloco.
  document.addEventListener('touchmove', (e) => { if (arrastando) e.preventDefault(); }, { passive: false });
  function ligarArrasto(alvo, bloco, modo, inicioLinha, blocoEl = alvo) {
    alvo.addEventListener('contextmenu', (e) => e.preventDefault());
    alvo.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (modo === 'mover' && e.target.closest('.bloco-alca')) return;
      if (modo === 'esticar') e.stopPropagation();
      const slot = estado.ajustes().day_slot_min;
      const y0 = e.clientY;
      const x0 = e.clientX;
      let ult = { y: y0, x: x0 };
      let ativo = false;
      let timer = null;
      let novo = { start_min: bloco.start_min, end_min: bloco.end_min };
      const limpar = () => {
        clearTimeout(timer);
        document.removeEventListener('pointermove', aoMover);
        document.removeEventListener('pointerup', aoSoltar);
        document.removeEventListener('pointercancel', aoCancelar);
      };
      const iniciar = () => { ativo = true; arrastando = true; blocoEl.classList.add('arrastando'); };
      function calcular() {
        const delta = (ult.y - y0) / PX_POR_MIN;
        if (modo === 'mover') {
          const dur = bloco.end_min - bloco.start_min;
          const start = Math.min(1440 - dur, ajustarAFatia(bloco.start_min + delta, slot));
          novo = { start_min: Math.max(0, start), end_min: Math.max(0, start) + dur };
        } else {
          const end = Math.min(1440, Math.max(bloco.start_min + Math.min(slot, 15), ajustarAFatia(bloco.end_min + delta, slot)));
          novo = { start_min: bloco.start_min, end_min: end };
        }
        blocoEl.style.top = posicao(novo.start_min, inicioLinha);
        blocoEl.style.height = `${(novo.end_min - novo.start_min) * PX_POR_MIN}px`;
      }
      function aoMover(ev) {
        ult = { y: ev.clientY, x: ev.clientX };
        if (!ativo) {
          const d = Math.hypot(ult.x - x0, ult.y - y0);
          if (ev.pointerType === 'mouse') { if (d > 6) iniciar(); } else if (d > 10) { limpar(); return; } // no toque, mexer antes dos 300 ms é rolagem
          if (!ativo) return;
        }
        calcular();
      }
      function terminar(confirmar) {
        limpar();
        if (!ativo) return;
        arrastando = false;
        blocoEl.classList.remove('arrastando');
        bloquearClique = true;
        setTimeout(() => { bloquearClique = false; }, 0);
        const mudou = confirmar && (novo.start_min !== bloco.start_min || novo.end_min !== bloco.end_min);
        if (mudou) gravarArrasto(bloco, novo);
        else desenhar();
      }
      function aoSoltar() { terminar(true); }
      function aoCancelar() { terminar(false); }
      document.addEventListener('pointermove', aoMover);
      document.addEventListener('pointerup', aoSoltar);
      document.addEventListener('pointercancel', aoCancelar);
      if (e.pointerType !== 'mouse') timer = setTimeout(iniciar, 300);
    });
  }

  const posicao = (min, inicio) => `${(min - inicio) * PX_POR_MIN}px`;

  function desenhar() {
    if (arrastando) return;
    titulo.textContent = rotuloDia(diaAtual);
    const a = estado.ajustes();
    const blocos = blocosDoPeriodo(estado.dados.commitments, estado.dados.blocks, diaAtual, diaAtual);
    const { inicio, fim } = limitesDoDia(blocos, a.day_start_min, a.day_end_min);
    linha.style.height = `${(fim - inicio) * PX_POR_MIN}px`;
    const filhos = [];
    for (let ini = inicio; ini < fim; ini += a.day_slot_min) {
      const fatia = criar('div', { class: 'fatia', 'data-inicio': String(ini) });
      fatia.style.top = posicao(ini, inicio);
      fatia.style.height = `${(Math.min(ini + a.day_slot_min, fim) - ini) * PX_POR_MIN}px`;
      if (ini % 60 === 0 || ini === inicio) fatia.append(criar('span', { class: 'fatia-hora', texto: horaTexto(ini) }));
      fatia.addEventListener('click', () => novoNaFatia(ini, blocos, fim));
      filhos.push(fatia);
    }
    for (const l of horariosLivres(blocos, inicio, fim)) {
      const livre = criar('div', { class: 'livre', 'data-inicio': String(l.start_min), texto: 'Livre' });
      livre.style.top = posicao(l.start_min, inicio);
      livre.style.height = `${(l.end_min - l.start_min) * PX_POR_MIN}px`;
      filhos.push(livre);
    }
    for (const b of posicionar(blocos)) {
      const el = elementoBloco(b, { compacto: false });
      if (b.fundo) el.classList.add('bloco-fundo');
      // Por cima de outro (dentro dele ou em cascata): contorno na cor da página para separar.
      else if (b.camada >= 1000 || b.recuo > 0) el.classList.add('bloco-sobre');
      const recuo = b.recuo * RECUO_PX;
      el.dataset.inicio = String(b.start_min);
      el.style.top = posicao(b.start_min, inicio);
      el.style.height = `${(b.end_min - b.start_min) * PX_POR_MIN}px`;
      el.style.left = `calc(var(--rotulo) + ${recuo}px + (100% - var(--rotulo) - ${recuo}px) * ${b.indice / b.total})`;
      el.style.width = `calc((100% - var(--rotulo) - ${recuo}px) / ${b.total} - 3px)`;
      el.style.zIndex = String(b.camada + 2);
      if ((b.end_min - b.start_min) * PX_POR_MIN < 40) el.classList.add('bloco-curto');
      ligarCabecaECorpo(el, b, {
        aoAbrir: () => { if (!bloquearClique) abrirBloco(b); },
        aoCorpo: (e) => {
          if (bloquearClique) return;
          const hora = horaNoPonto(e.clientY, b.start_min);
          if (!hora) { if (selecaoAtual()) avisarSelecao('Sem espaço livre neste horário.'); return; }
          if (selecaoAtual()) agendarSelecionada(estado, { date: diaAtual, ...hora });
          else abrirBloco({ novo: true, date: diaAtual, ...hora });
        },
      });
      ligarArrasto(el, b, 'mover', inicio);
      const alca = criar('div', { class: 'bloco-alca', 'aria-hidden': 'true' }, criar('i'));
      el.append(alca);
      ligarArrasto(alca, b, 'esticar', inicio, el);
      filhos.push(el);
    }
    const agora = new Date();
    const min = agora.getHours() * 60 + agora.getMinutes();
    if (diaAtual === isoDe(agora) && min >= inicio && min <= fim) {
      const marca = criar('div', { class: 'agora-linha', 'data-min': String(min) });
      marca.style.top = posicao(min, inicio);
      filhos.push(marca);
    }
    linha.replaceChildren(...filhos);
    desenhado = { blocos, inicio, fim, fatia: a.day_slot_min };
    // Dia de hoje: abre perto da hora atual (a primeira vez que se vê o dia e no botão Hoje).
    if (rolarParaAgora !== diaAtual && diaAtual === isoDe(agora)) {
      rolarParaAgora = diaAtual;
      const min = agora.getHours() * 60 + agora.getMinutes();
      const fatias = [...linha.querySelectorAll('.fatia')].filter((f) => Number(f.dataset.inicio) <= min);
      fatias[fatias.length - 1]?.scrollIntoView({ block: 'start' });
    }
    montarFila(fila, { estado, hoje: isoDe(agora), aoSoltar: soltarNaFatia });
  }

  document.addEventListener('dia-mudou', ({ detail }) => {
    if (diaAtual === detail.antes) diaAtual = detail.agora;
    if (!secao.hidden && diaAtual) desenhar();
  });
  registrarTela('hoje', {
    mostrar() {
      // Pela aba, o dia volta a ser hoje; pelo nome do dia na Semana, fica o dia escolhido.
      if (!manterDia || !diaAtual) diaAtual = isoDe(new Date());
      manterDia = false;
      desenhar();
    },
  });
  estado.aoMudar(() => { if (!secao.hidden && diaAtual) desenhar(); });
}
