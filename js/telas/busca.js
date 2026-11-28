// Tela Busca: uma caixa, filtro por categoria e resultados com o trecho achado.
import { registrarTela, irPara } from './casca.js';
import { emOrdem } from '../regras/tags.js';
import { criar } from './quadro.js';
import { chipCategoria } from './ajustes.js';
import { buscar } from '../regras/busca.js';

const ESPERA_DIGITACAO = 250;

const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// O trecho vem de anotações do usuário: entra só como texto, nunca como HTML.
function trechoComMarca(r) {
  return criar('span', { class: 'resultado-trecho' },
    document.createTextNode((r.cortado_antes ? '…' : '') + r.trecho.slice(0, r.inicio)),
    criar('mark', { texto: r.trecho.slice(r.inicio, r.fim) }),
    document.createTextNode(r.trecho.slice(r.fim) + (r.cortado_depois ? '…' : '')));
}

export function iniciarBusca({ estado, abrirCard, mostrarDia }) {
  const secao = document.querySelector('#tela-busca');
  let termo = '';
  let categoria = '';
  let timer = null;

  const campo = criar('input', { id: 'busca-termo', type: 'search', placeholder: 'Buscar em cards, itens e histórico', 'aria-label': 'Buscar', autocomplete: 'off', enterkeyhint: 'search' });
  const filtros = criar('div', { class: 'filtro-categorias', id: 'busca-categorias' });
  const resultados = criar('div', { id: 'busca-resultados', 'aria-live': 'polite' });
  secao.replaceChildren(campo, filtros, resultados);

  const cardPorId = (id) => estado.dados.cards.find((c) => c.id === id);
  const itemPorId = (id) => estado.dados.items.find((i) => i.id === id);
  const blocoPorId = (id) => estado.dados.blocks.find((b) => b.id === id);

  function origem(r) {
    if (r.campo === 'titulo') return 'Título';
    if (r.campo === 'notas') return 'Anotações';
    if (r.campo === 'no_lugar') return `No lugar · ${dataCurta(r.ocorrencia_data ?? blocoPorId(r.bloco_id).date)}`;
    if (r.campo === 'motivo') return `Por que não fez · ${dataCurta(blocoPorId(r.bloco_id).date)}`;
    return `Item: ${itemPorId(r.item_id)?.title ?? ''}`;
  }

  function linha(r) {
    const bloco = r.bloco_id ? blocoPorId(r.bloco_id) : null;
    const titulo = cardPorId(r.card_id)?.title ?? bloco?.title ?? '';
    const atributos = { class: 'resultado', type: 'button', 'data-campo': r.campo };
    if (r.card_id) atributos['data-card'] = r.card_id;
    if (r.campo === 'item' || r.campo === 'notas_item') atributos['data-item'] = r.item_id;
    if (r.bloco_id) atributos['data-bloco'] = r.bloco_id;
    if (r.ocorrencia_data) atributos['data-ocorrencia'] = r.ocorrencia_data;
    const el = criar('button', atributos,
      criar('span', { class: 'resultado-titulo', texto: titulo || 'Sem título' }),
      criar('span', { class: 'resultado-origem', texto: origem(r) }),
      trechoComMarca(r));
    el.addEventListener('click', () => {
      if (r.ocorrencia_data) irPara('fixas');
      else if (r.campo === 'no_lugar' || r.campo === 'motivo') mostrarDia(bloco.date);
      else abrirCard(r.card_id, r.item_id ? { itemId: r.item_id } : undefined);
    });
    return el;
  }

  function desenharFiltros() {
    const categorias = emOrdem(estado.dados.categories);
    if (categoria && !categorias.some((c) => c.id === categoria)) categoria = '';
    const chip = (c) => {
      const id = c ? c.id : '';
      const b = criar('button', { type: 'button', class: `filtro-chip${c?.parent_id ? ' filtro-sub' : ''}${categoria === id ? ' ativo' : ''}`, 'data-cat': id, 'aria-pressed': String(categoria === id) },
        c ? chipCategoria(c) : criar('span', { class: 'chip', texto: 'Todas' }));
      b.addEventListener('click', () => { categoria = id; desenhar(); });
      return b;
    };
    filtros.replaceChildren(chip(null), ...categorias.map(chip));
  }

  function desenharResultados() {
    const limpo = termo.trim();
    if (limpo.length < 2) {
      resultados.replaceChildren(criar('p', { class: 'vazio', texto: 'Digite pelo menos 2 letras para buscar.' }));
      return;
    }
    const achados = buscar(limpo, estado.dados, { categoria: categoria || undefined, categories: estado.dados.categories });
    resultados.replaceChildren(...(achados.length
      ? achados.map(linha)
      : [criar('p', { class: 'vazio', texto: `Nada encontrado para “${limpo}”.` })]));
  }

  function desenhar() { desenharFiltros(); desenharResultados(); }

  campo.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { termo = campo.value; desenharResultados(); }, ESPERA_DIGITACAO);
  });
  campo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    clearTimeout(timer); termo = campo.value; desenharResultados(); campo.blur();
  });

  registrarTela('busca', { mostrar: desenhar });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
