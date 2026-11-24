// Tela Diário: o que foi estudado, por dia, com busca e filtro por tag. Tocar num registro abre o bloco.
import { registrarTela } from './casca.js';
import { registrosDoDiario } from '../regras/diario.js';
import { rotuloDia, horaTexto } from '../regras/datas.js';
import { emOrdem } from '../regras/tags.js';
import { abrirBloco } from './bloco.js';

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

const DIAS_POR_PAGINA = 50;
const dataCurta = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;

// Um registro (usado aqui e na seção Diário do card).
export function itemDoDiario(r, { comData = false, aoAbrir }) {
  const b = r.bloco;
  const origem = [comData ? dataCurta(b.date) : null, horaTexto(b.start_min), r.card?.title || b.title || null, r.item?.title || null].filter(Boolean).join(' · ');
  const el = criar('button', { type: 'button', class: 'diario-item', 'data-bloco': b.id },
    criar('span', { class: 'diario-origem', texto: origem }),
    criar('span', { class: 'diario-texto', texto: r.texto }));
  el.addEventListener('click', aoAbrir);
  return el;
}

export function iniciarDiario({ estado }) {
  const secao = document.querySelector('#tela-diario');
  const busca = criar('input', { id: 'diario-busca', type: 'search', placeholder: 'Buscar no diário', 'aria-label': 'Buscar no diário', autocomplete: 'off' });
  const tag = criar('select', { id: 'diario-tag', 'aria-label': 'Filtrar por tag' });
  const lista = criar('div', { id: 'diario-lista', class: 'diario-lista' });
  const mais = criar('button', { type: 'button', class: 'btn', id: 'diario-mais', texto: 'Ver mais' });
  secao.replaceChildren(criar('div', { class: 'diario-filtros' }, busca, tag), lista, mais);
  let dias = DIAS_POR_PAGINA;

  function desenharTags() {
    const atual = tag.value;
    const maes = emOrdem(estado.dados.categories.filter((c) => !c.parent_id && !c.archived));
    tag.replaceChildren(criar('option', { value: '', texto: 'Todas as tags' }), ...maes.map((c) => criar('option', { value: c.id, texto: c.name })));
    tag.value = maes.some((c) => c.id === atual) ? atual : '';
  }

  function desenhar() {
    const registros = registrosDoDiario(estado.dados, { tagId: tag.value || undefined, termo: busca.value });
    const porDia = new Map();
    for (const r of registros) {
      if (!porDia.has(r.bloco.date)) porDia.set(r.bloco.date, []);
      porDia.get(r.bloco.date).push(r);
    }
    const datas = [...porDia.keys()];
    if (!datas.length) {
      lista.replaceChildren(criar('div', { class: 'cartao vazio', texto: busca.value.trim() || tag.value
        ? 'Nada no diário com esse filtro.' : 'Ao marcar um bloco como cumprido, escreva o que estudou: o diário aparece aqui.' }));
    } else {
      lista.replaceChildren(...datas.slice(0, dias).map((d) => criar('section', { class: 'cartao diario-dia', 'data-data': d },
        criar('h3', { texto: rotuloDia(d) }),
        ...porDia.get(d).map((r) => itemDoDiario(r, { aoAbrir: () => abrirBloco(r.bloco) })))));
    }
    mais.hidden = datas.length <= dias;
  }

  let espera = null;
  busca.addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(() => { dias = DIAS_POR_PAGINA; desenhar(); }, 200); });
  tag.addEventListener('change', () => { dias = DIAS_POR_PAGINA; desenhar(); });
  mais.addEventListener('click', () => { dias += DIAS_POR_PAGINA; desenhar(); });

  registrarTela('diario', { mostrar: () => { dias = DIAS_POR_PAGINA; desenharTags(); desenhar(); } });
  estado.aoMudar(() => { if (!secao.hidden) { desenharTags(); desenhar(); } });
}
