// Tela Semana: sete colunas (segunda a domingo) com faixas grandes.
import { abrirModelos } from './modelos.js';
import { registrarTela, irPara } from './casca.js';
import { criar, elementoBloco, abrirBloco, ligarCabecaECorpo, idDoBloco } from './bloco.js';
import { mostrarDia } from './hoje.js';
import { diasDaSemana, somaDias, isoDe, horaTexto, rotuloSemana, DIAS_CURTOS, inicioDaSemana } from '../regras/datas.js';
import { blocosDoPeriodo, faixasDaSemana, limitesDoDia, horariosLivres, posicionar, inicioMaisUmaHora, trechoLivreNoMinuto } from '../regras/calendario.js';
import { montarFila, selecaoAtual, agendarSelecionada, agendarEntrada, umaHoraLivre, avisarSelecao } from './fila.js';

// Altura de cada faixa da grade: os blocos são desenhados numa camada por cima, proporcionais à duração.
const ALTURA_FAIXA = 72;
// Recuo, por nível, de um bloco em cascata (começa depois de outro com que se cruza).
const RECUO_PX = 14;

// Abre a Semana que contém o dia `iso` (botão "Semana" da tela do dia).
let semanaPedida = null;
export function mostrarSemana(iso) {
  semanaPedida = iso;
  irPara('semana');
}

export function iniciarSemana({ estado }) {
  const secao = document.querySelector('#tela-semana');
  let referencia = isoDe(new Date()); // qualquer dia da semana mostrada

  const titulo = criar('h2', { id: 'sem-titulo' });
  const botao = (id, texto, rotulo) => criar('button', { type: 'button', class: 'btn', id, 'aria-label': rotulo, texto });
  const ant = botao('sem-ant', '‹', 'Semana anterior');
  const prox = botao('sem-prox', '›', 'Próxima semana');
  const hoje = botao('sem-hoje', 'Hoje', 'Voltar para a semana de hoje');
  ant.addEventListener('click', () => { referencia = somaDias(referencia, -7); desenhar(); });
  prox.addEventListener('click', () => { referencia = somaDias(referencia, 7); desenhar(); });
  hoje.addEventListener('click', () => { referencia = isoDe(new Date()); rolarParaAgora = true; desenhar(); });
  let rolarParaAgora = true;
  const modelos = criar('button', { type: 'button', class: 'btn', id: 'semana-modelos', 'aria-label': 'Modelos de semana' },
    criar('i', { class: 'ti ti-template', 'aria-hidden': 'true' }), ' Modelos');
  modelos.addEventListener('click', () => abrirModelos({ estado, segunda: inicioDaSemana(referencia) }));
  const topo = criar('div', { class: 'cal-topo' }, ant, titulo, hoje, prox, modelos);

  const grade = criar('div', { class: 'semana-grade', id: 'sem-grade' });
  const fila = criar('aside', { id: 'fila-semana', class: 'fila' });
  secao.replaceChildren(criar('div', { class: 'cal-layout' },
    criar('div', { class: 'cal-principal' }, topo, criar('div', { class: 'semana-rolagem' }, grade)), fila));

  // Faixa -> { date, slot }: a hora que um toque ou um arrasto de item da fila cria ali.
  const alvos = new WeakMap();

  // Camada de blocos de cada dia -> o que é preciso para achar a hora de um ponto tocado no corpo de um bloco.
  const infoDoDia = new WeakMap();

  // Hora nova a partir do ponto `y` sobre a camada do dia: fatia do dia (para baixo) e uma hora, até o próximo bloco.
  // `piso`: início do bloco tocado — o novo nunca começa antes dele.
  function horaNoPonto(camada, y, piso = 0) {
    const d = infoDoDia.get(camada);
    if (!d) return null;
    const bruto = d.inicio + (y - camada.getBoundingClientRect().top) / d.pxPorMin;
    const min = Math.max(d.inicio, piso, Math.floor(bruto / d.fatia) * d.fatia);
    const hora = inicioMaisUmaHora(min, d.doDia, d.fim);
    return hora && { date: d.date, ...hora };
  }

  function soltarNaFaixa(entrada, x, y) {
    const sob = document.elementFromPoint(x, y);
    if (sob?.closest('.bloco')) {
      const alvo = horaNoPonto(sob.closest('.dia-blocos'), y, Number(sob.closest('.bloco').dataset.inicio) || 0);
      if (alvo) agendarEntrada(estado, entrada, alvo);
      return;
    }
    const alvo = sob ? alvos.get(sob.closest('.faixa')) : null;
    if (alvo?.slot) agendarEntrada(estado, entrada, { date: alvo.date, ...alvo.slot });
  }

  function desenhar() {
    const dias = diasDaSemana(referencia);
    const hojeIso = isoDe(new Date());
    titulo.textContent = rotuloSemana(dias);
    const a = estado.ajustes();
    const todos = blocosDoPeriodo(estado.dados.commitments, estado.dados.blocks, dias[0], dias[6]);
    // Um bloco fora do período configurado alarga a grade da semana toda, para ele não ficar invisível.
    const { inicio, fim } = limitesDoDia(todos, a.day_start_min, a.day_end_min);
    const porDia = dias.map((d) => faixasDaSemana(todos.filter((b) => b.date === d), inicio, fim, a.week_slot_min));
    const linhas = porDia[0].length;
    grade.style.gridTemplateRows = `auto repeat(${linhas}, ${ALTURA_FAIXA}px)`;
    const pxPorMin = ALTURA_FAIXA / a.week_slot_min;
    const px = (min) => `${Math.round(min * pxPorMin)}px`;

    const celulas = [criar('div', { class: 'semana-canto', style: 'grid-column:1;grid-row:1' })];
    porDia[0].forEach((f, i) => {
      celulas.push(criar('div', { class: 'hora', style: `grid-column:1;grid-row:${i + 2}`, texto: horaTexto(f.start_min) }));
    });
    dias.forEach((iso, c) => {
      const nome = criar('button', { type: 'button', class: 'dia-nome', style: `grid-column:${c + 2};grid-row:1`, 'aria-label': `Abrir ${iso.slice(8)}/${iso.slice(5, 7)} em Hoje` },
        criar('span', { texto: DIAS_CURTOS[c] }), criar('b', { texto: String(Number(iso.slice(8))) }));
      nome.addEventListener('click', () => mostrarDia(iso));
      const coluna = criar('div', { class: `dia${iso === hojeIso ? ' hoje' : ''}`, 'data-data': iso }, nome);
      const doDia = todos.filter((b) => b.date === iso);
      porDia[c].forEach((f, i) => {
        const faixa = criar('div', { class: 'faixa', 'data-inicio': String(f.start_min), style: `grid-column:${c + 2};grid-row:${i + 2}` });
        // Com um item da fila escolhido, a hora começa no início do trecho livre da faixa.
        const livres = horariosLivres(f.blocos, f.start_min, f.end_min);
        const slot = livres.length ? umaHoraLivre(livres[0].start_min, doDia, fim) : null;
        alvos.set(faixa, { date: iso, slot });
        // Trecho livre só aparece com ao menos metade da faixa: tocar nele cria ou agenda ali.
        livres.filter((l) => l.end_min - l.start_min >= (f.end_min - f.start_min) / 2).forEach((l) => {
          const livre = criar('div', { class: 'livre', 'data-inicio': String(l.start_min), texto: 'Livre',
            style: `top:calc(${px(l.start_min - f.start_min)} + 3px);height:calc(${px(l.end_min - l.start_min)} - 6px)` });
          livre.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (selecaoAtual()) { agendarSelecionada(estado, { date: iso, ...umaHoraLivre(l.start_min, doDia, fim) }); return; }
            abrirBloco({ novo: true, date: iso, start_min: l.start_min, end_min: l.end_min });
          });
          faixa.append(livre);
        });
        faixa.addEventListener('click', (ev) => {
          if (selecaoAtual()) { if (slot) agendarSelecionada(estado, { date: iso, ...slot }); else avisarSelecao('Sem espaço livre nesta faixa.'); return; }
          // Vão entre dois blocos (curto demais para ganhar o "Livre"): tocar nele marca um compromisso ali.
          const minuto = f.start_min + (ev.clientY - faixa.getBoundingClientRect().top) / pxPorMin;
          const trecho = trechoLivreNoMinuto(doDia, minuto, inicio, fim);
          if (trecho) abrirBloco({ novo: true, date: iso, start_min: trecho.start_min, end_min: Math.min(trecho.end_min, trecho.start_min + 60) });
        });
        coluna.append(faixa);
      });
      // Cada bloco é uma peça só, da hora de início à de fim. Sobrepostos: fundo embaixo, lado a lado ou cascata.
      const camada = criar('div', { class: 'dia-blocos', style: `grid-column:${c + 2};grid-row:2 / span ${linhas}` });
      infoDoDia.set(camada, { date: iso, inicio, fim, pxPorMin, fatia: a.day_slot_min, doDia });
      posicionar(doDia).forEach((b) => {
        const el = elementoBloco(b, { compacto: true });
        if (b.fundo) el.classList.add('bloco-fundo');
        // Por cima de outro (dentro dele ou em cascata): contorno na cor da página para separar.
        else if (b.camada >= 1000 || b.recuo > 0) el.classList.add('bloco-sobre');
        const recuo = b.recuo * RECUO_PX;
        el.dataset.inicio = String(b.start_min);
        el.style.top = px(b.start_min - inicio);
        el.style.height = px(b.end_min - b.start_min);
        el.style.left = `calc(${recuo}px + (100% - ${recuo}px) * ${b.indice / b.total} + 2px)`;
        el.style.width = `calc((100% - ${recuo}px) / ${b.total} - 4px)`;
        el.style.zIndex = String(b.camada);
        const original = doDia.find((x) => idDoBloco(x) === idDoBloco(b)) || b;
        ligarCabecaECorpo(el, original, {
          aoCorpo: (e) => {
            const alvo = horaNoPonto(camada, e.clientY, b.start_min);
            if (!alvo) { if (selecaoAtual()) avisarSelecao('Sem espaço livre neste horário.'); return; }
            if (selecaoAtual()) agendarSelecionada(estado, alvo);
            else abrirBloco({ novo: true, ...alvo });
          },
        });
        camada.append(el);
      });
      coluna.append(camada);
      celulas.push(coluna);
    });
    grade.replaceChildren(...celulas);
    montarFila(fila, { estado, hoje: hojeIso, aoSoltar: soltarNaFaixa });
    // Com o dia inteiro na grade, a semana de hoje abre perto da hora atual (só na primeira vez e no botão Hoje).
    if (rolarParaAgora && dias.includes(hojeIso)) {
      rolarParaAgora = false;
      const agora = new Date();
      const min = agora.getHours() * 60 + agora.getMinutes();
      const faixas = [...grade.querySelectorAll('.dia.hoje .faixa')].filter((f) => Number(f.dataset.inicio) <= min);
      faixas[faixas.length - 1]?.scrollIntoView({ block: 'start' });
    }
  }

  // Virada do dia com o app aberto: quem olhava a semana de hoje passa a ver a nova semana de hoje.
  document.addEventListener('dia-mudou', ({ detail }) => {
    if (detail.antes && diasDaSemana(referencia)[0] === diasDaSemana(detail.antes)[0]) referencia = detail.agora;
    if (!secao.hidden) desenhar();
  });
  registrarTela('semana', { mostrar: () => { if (semanaPedida) { referencia = semanaPedida; semanaPedida = null; } desenhar(); } });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
