// Dashboards: horas de estudo, metas por tag, horas no tempo e onde fica o "não feito".
import { registrarTela, irPara } from './casca.js';
import { blocosDoPeriodo } from '../regras/calendario.js';
import { agoraNoFuso } from '../regras/lembretes.js';
import { somaDias, diaDaSemana, horaTexto, MESES } from '../regras/datas.js';
import {
  tagsDeEstudo, blocosDeEstudo, situacao, resumo, periodo, deslocar, graoDoIntervalo, serie,
  horasPorTag, corDaMeta, formatarHoras, semanasDoPeriodo, sequenciaDosDados, intervaloValido,
} from '../regras/acompanhamento.js';
import { graficoBarras } from './graficos.js';
import { serieFlash, acertoDoPeriodo } from '../regras/flash.js';

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

const PERIODOS = [['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['intervalo', 'Intervalo']];
const INICIAIS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const MAX_LISTA = 50;
const dm = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

export function agoraDoApp(estado) {
  return agoraNoFuso(Date.now(), estado.ajustes().fuso);
}

// Blocos de estudo entre duas datas (gravados + ocorrências das fixas).
export function estudoEntre(estado, de, ate) {
  const d = estado.dados;
  return blocosDeEstudo(blocosDoPeriodo(d.commitments, d.blocks, de, ate), tagsDeEstudo(d.categories));
}

export function sequenciaAtual(estado, agora) {
  return sequenciaDosDados(estado.dados, agora, estado.ajustes().sequencia_min);
}

export function metrica(id, rotulo, valor, sub) {
  return criar('div', { class: 'metrica', id }, criar('small', { texto: rotulo }), criar('b', { texto: valor }), criar('small', { texto: sub }));
}

// Uma linha por tag (e subtags recuadas). `semanas` > 1 mostra a média por semana contra a meta.
export function linhasDeTags(categories, estudo, semanas) {
  const tags = horasPorTag(categories, estudo, semanas);
  const maior = Math.max(1, ...tags.map((t) => t.cumprido_min));
  const linha = (t, sub) => {
    const valor = semanas > 1 ? t.media_min : t.cumprido_min;
    let texto; let pct; let cor;
    if (t.meta_min) {
      texto = semanas > 1 ? `média ${formatarHoras(valor)} / ${formatarHoras(t.meta_min)} por semana` : `${formatarHoras(valor)} / ${formatarHoras(t.meta_min)}`;
      pct = Math.min(100, (valor / t.meta_min) * 100); cor = corDaMeta(valor, t.meta_min);
    } else {
      texto = formatarHoras(t.cumprido_min);
      pct = (t.cumprido_min / maior) * 100; cor = 'livre';
    }
    const preenchido = criar('i'); preenchido.style.width = `${Math.round(pct)}%`;
    return criar('div', { class: `dash-tag${sub ? ' dash-sub' : ''}`, 'data-tag': t.id },
      criar('div', { class: 'dash-tag-linha' }, criar('span', { class: 'dash-tag-nome', texto: t.nome }), criar('span', { class: 'dash-tag-texto', texto })),
      criar('div', { class: 'dash-barra', 'data-cor': cor }, preenchido));
  };
  return tags.flatMap((t) => [linha(t, false), ...t.filhas.map((f) => linha(f, true))]);
}

export function itensNaoFeitos(estado, estudo, agora, classe = 'dash-nao-feito') {
  const nomes = new Map(estado.dados.categories.map((c) => [c.id, c.name]));
  const lista = estudo.map((b) => ({ b, s: situacao(b, agora) })).filter(({ s }) => s === 'nao_feito' || s === 'sem_marcar')
    .sort((x, y) => (x.b.date < y.b.date ? 1 : x.b.date > y.b.date ? -1 : y.b.start_min - x.b.start_min));
  const itens = lista.slice(0, MAX_LISTA).map(({ b, s }) => criar('li', { class: classe },
    criar('div', { texto: `${dm(b.date)} ${horaTexto(b.start_min)} · ${b.title || 'Estudo'} · ${nomes.get(b.category_id) || ''}` }),
    criar('div', { class: `suave estado-${s}`, texto: s === 'sem_marcar' ? 'sem marcar' : 'não feito' }),
    ...((b.instead_note || '').trim() ? [criar('div', { class: 'suave', texto: `No lugar: ${b.instead_note.trim()}` })] : [])));
  if (lista.length > MAX_LISTA) itens.push(criar('li', { class: 'suave', texto: `e mais ${lista.length - MAX_LISTA}` }));
  return itens;
}

export function iniciarDashboards({ estado }) {
  const secao = document.querySelector('#tela-dashboards');
  let tipo = 'semana';
  let ancora = null;
  let intervalo = null;

  const seletor = criar('div', { class: 'seg', id: 'dash-periodo', role: 'group', 'aria-label': 'Período' },
    ...PERIODOS.map(([v, r]) => criar('button', { type: 'button', 'data-periodo': v, texto: r })));
  const anterior = criar('button', { type: 'button', class: 'btn-icone', id: 'dash-anterior', 'aria-label': 'Período anterior' }, criar('i', { class: 'ti ti-chevron-left', 'aria-hidden': 'true' }));
  const proximo = criar('button', { type: 'button', class: 'btn-icone', id: 'dash-proximo', 'aria-label': 'Próximo período' }, criar('i', { class: 'ti ti-chevron-right', 'aria-hidden': 'true' }));
  const rotulo = criar('span', { id: 'dash-rotulo', class: 'dash-rotulo' });
  const de = criar('input', { type: 'date', id: 'dash-de', 'aria-label': 'Início' });
  const ate = criar('input', { type: 'date', id: 'dash-ate', 'aria-label': 'Fim' });
  const datas = criar('div', { class: 'dash-datas' }, de, criar('span', { texto: 'a' }), ate);
  const erro = criar('div', { class: 'erro', id: 'dash-erro', role: 'alert' });
  const navegacao = criar('div', { class: 'dash-nav' }, anterior, rotulo, proximo);
  const numeros = criar('div', { class: 'dash-numeros' });
  const tags = criar('div', { id: 'dash-tags' });
  const serieEl = criar('div', { id: 'dash-serie' });
  const lista = criar('ul', { id: 'dash-nao-feitos', class: 'dash-lista' });
  const tituloSerie = criar('h3');
  const conteudo = criar('div', { class: 'dash-conteudo' },
    numeros,
    criar('div', { class: 'cartao' }, criar('h3', { texto: 'Metas e horas por tag' }), tags),
    criar('div', { class: 'cartao' }, tituloSerie, serieEl,
      criar('div', { class: 'dash-legenda' }, criar('span', { class: 'leg-cumprido', texto: 'Cumprido' }), criar('span', { class: 'leg-planejado', texto: 'Planejado' }))),
    criar('div', { class: 'cartao' }, criar('h3', { texto: 'Não feitos no período' }), lista));
  const irTags = criar('button', { type: 'button', class: 'btn btn-principal', id: 'dash-ir-tags', texto: 'Abrir Tags' });
  irTags.addEventListener('click', () => irPara('tags'));
  const vazio = criar('div', { class: 'cartao vazio', id: 'dash-vazio' },
    criar('p', { texto: 'Marque quais tags contam como estudo para ver as horas, as metas e a sequência.' }), irTags);
  const flashAcerto = criar('p', { id: 'dash-flash-acerto', class: 'dash-flash-acerto' });
  const flashSerie = criar('div', { id: 'dash-flash-serie' });
  const flash = criar('div', { class: 'cartao', id: 'dash-flash' }, criar('h3', { texto: 'Flashcards' }), flashAcerto, flashSerie,
    criar('div', { class: 'dash-legenda' }, criar('span', { class: 'leg-cumprido', texto: 'Acertos de primeira' }), criar('span', { class: 'leg-planejado', texto: 'Revisados' })));
  secao.replaceChildren(seletor, navegacao, datas, erro, vazio, conteudo, flash);

  function atual(agora) {
    if (tipo === 'intervalo') return periodo('intervalo', agora.data, intervalo);
    return periodo(tipo, ancora);
  }

  function desenhar() {
    const agora = agoraDoApp(estado);
    if (!ancora) ancora = agora.data;
    if (!intervalo) intervalo = { de: somaDias(agora.data, -29), ate: agora.data };
    seletor.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === tipo)));
    const p = atual(agora);
    rotulo.textContent = p.rotulo;
    const livre = tipo === 'intervalo';
    anterior.hidden = livre; proximo.hidden = livre; datas.hidden = !livre;
    // Redesenhar volta os campos ao último intervalo válido; o erro de antes não vale mais.
    if (livre) { de.value = intervalo.de; ate.value = intervalo.ate; }
    erro.textContent = '';

    desenharFlash(p);
    const temEstudo = tagsDeEstudo(estado.dados.categories).size > 0;
    vazio.hidden = temEstudo; conteudo.hidden = !temEstudo;
    if (!temEstudo) return;

    const estudo = estudoEntre(estado, p.de, p.ate);
    const r = resumo(estudo, agora);
    const minimo = estado.ajustes().sequencia_min;
    const dias = sequenciaAtual(estado, agora);
    numeros.replaceChildren(
      metrica('dash-cumprido', 'Estudo cumprido', formatarHoras(r.cumprido_min), `de ${formatarHoras(r.planejado_min)} planejadas`),
      metrica('dash-sequencia', 'Sequência', `${dias} ${dias === 1 ? 'dia' : 'dias'}`, `mín. ${formatarHoras(minimo)}/dia`),
      metrica('dash-pct', 'Cumprido', r.pct === null ? '—' : `${r.pct}%`, 'dos blocos'));

    const semanas = tipo === 'semana' ? 1 : semanasDoPeriodo(p.de, p.ate, agora.data);
    const linhas = linhasDeTags(estado.dados.categories, estudo, semanas);
    tags.replaceChildren(...(linhas.length ? linhas : [criar('p', { class: 'suave', texto: 'Nenhuma hora cumprida nem meta neste período.' })]));

    const grao = tipo === 'semana' ? 'dia' : tipo === 'mes' ? 'semana' : tipo === 'ano' ? 'mes' : graoDoIntervalo(p.de, p.ate);
    tituloSerie.textContent = { dia: 'Horas de estudo por dia', semana: 'Horas de estudo por semana', mes: 'Horas de estudo por mês' }[grao];
    if (!estudo.length) {
      serieEl.replaceChildren(criar('p', { class: 'suave', texto: 'Nenhum estudo neste período.' }));
      lista.replaceChildren();
      return;
    }
    const barras = serie(estudo, p.de, p.ate, grao).map((x) => ({ ...x,
      rotulo: grao === 'mes' ? MESES[Number(x.inicio.slice(5, 7)) - 1].slice(0, 3) : grao === 'semana' ? dm(x.inicio)
        : tipo === 'semana' ? INICIAIS[diaDaSemana(x.inicio) - 1] : String(Number(x.inicio.slice(8))) }));
    serieEl.innerHTML = graficoBarras(barras, `${tituloSerie.textContent}: barra clara planejado, verde cumprido`);
    lista.replaceChildren(...itensNaoFeitos(estado, estudo, agora));
  }

  // Flashcards revisados (cartões distintos no dia) e acerto de primeira, no mesmo período e grão das horas.
  function desenharFlash(p) {
    const dias = estado.dados.flash_dias || [];
    const pct = acertoDoPeriodo(dias, p.de, p.ate);
    if (pct === null) {
      flashAcerto.textContent = '';
      flashSerie.replaceChildren(criar('p', { class: 'suave', texto: 'Nenhum flashcard revisado neste período.' }));
      return;
    }
    const total = dias.filter((x) => x.data >= p.de && x.data <= p.ate).reduce((s2, x) => s2 + x.revisados, 0);
    flashAcerto.textContent = `${pct}% de acerto · ${total} ${total === 1 ? 'revisado' : 'revisados'}`;
    const grao = tipo === 'semana' ? 'dia' : tipo === 'mes' ? 'semana' : tipo === 'ano' ? 'mes' : graoDoIntervalo(p.de, p.ate);
    const barras = serieFlash(dias, p.de, p.ate, grao).map((x) => ({ planejado_min: x.revisados, cumprido_min: x.acertos,
      rotulo: grao === 'mes' ? MESES[Number(x.inicio.slice(5, 7)) - 1].slice(0, 3) : grao === 'semana' ? dm(x.inicio)
        : tipo === 'semana' ? INICIAIS[diaDaSemana(x.inicio) - 1] : String(Number(x.inicio.slice(8))) }));
    flashSerie.innerHTML = graficoBarras(barras, 'Flashcards revisados por período: barra clara revisados, verde acertos de primeira');
  }

  seletor.addEventListener('click', (e) => {
    const b = e.target.closest('[data-periodo]');
    if (!b) return;
    tipo = b.dataset.periodo;
    desenhar();
  });
  anterior.addEventListener('click', () => { ancora = deslocar(tipo, ancora, -1); desenhar(); });
  proximo.addEventListener('click', () => { ancora = deslocar(tipo, ancora, 1); desenhar(); });
  const mudarDatas = () => {
    if (!de.value || !ate.value) return;
    const problema = intervaloValido(de.value, ate.value);
    if (problema) { erro.textContent = problema; return; }
    intervalo = { de: de.value, ate: ate.value };
    desenhar();
  };
  de.addEventListener('change', mudarDatas);
  ate.addEventListener('change', mudarDatas);

  registrarTela('dashboards', { mostrar: desenhar });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
