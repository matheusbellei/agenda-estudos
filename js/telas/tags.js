// Tela Tags: tags e subtags (dois níveis) com cor e ícone, como no controle financeiro.
// Criar e editar numa janela; arquivar (a mãe leva as subtags) e excluir com confirmação.
import { registrarTela } from './casca.js';
import { seletorDeCor, corDoTexto } from './ajustes.js';
import { filhasDe, nomeRepetido } from '../regras/tags.js';

export const CORES_TAG = [
  '#3B2416', '#6F4E37', '#8C5A3C', '#A0522D', '#C68B59', '#D4A373', '#B5543A', '#9C6644', '#7F5539', '#A68A73', '#E6CCB2', '#5C4033',
  '#C0392B', '#E74C3C', '#E57373', '#D35400', '#E67E22', '#F39C12', '#F1C40F', '#F7DC6F', '#B7950B', '#FF8A65',
  '#1E8449', '#27AE60', '#52BE80', '#5B7A3A', '#7A8B5A', '#A9DFBF', '#16A085', '#48C9B0', '#0E6655', '#82E0AA',
  '#1B4F72', '#2471A3', '#3498DB', '#5DADE2', '#85C1E9', '#2E86C1', '#154360', '#76D7C4',
  '#4A235A', '#6C3483', '#8E44AD', '#A569BD', '#C39BD3', '#D81B60', '#EC407A', '#F48FB1', '#AD1457', '#F8BBD0',
  '#212121', '#424242', '#616161', '#9E9E9E', '#BDBDBD', '#607D8B', '#90A4AE', '#795548',
];

export const GRUPOS_ICONES = [
  ['Estudos', ['book', 'books', 'notebook', 'school', 'certificate', 'pencil', 'writing', 'highlight', 'clipboard', 'presentation', 'backpack', 'bookmark']],
  ['Idiomas', ['language', 'alphabet-latin', 'message-language', 'world', 'flag', 'messages', 'microphone', 'headphones']],
  ['Exatas e ciência', ['math', 'calculator', 'math-function', 'chart-line', 'atom', 'flask', 'dna', 'microscope', 'planet', 'binary']],
  ['Tecnologia', ['code', 'terminal-2', 'device-laptop', 'database', 'cpu', 'cloud', 'robot', 'device-mobile']],
  ['Humanas e artes', ['palette', 'brush', 'music', 'movie', 'camera', 'building-bank', 'scale', 'gavel', 'users', 'brain']],
  ['Trabalho', ['briefcase', 'chart-bar', 'report-money', 'coin', 'building', 'phone', 'mail', 'calendar', 'clock', 'target']],
  ['Saúde e rotina', ['heart', 'run', 'barbell', 'yoga', 'apple', 'bed', 'coffee', 'sun', 'moon', 'walk']],
  ['Outros', ['star', 'bulb', 'rocket', 'puzzle', 'trophy', 'tag', 'pin', 'crown', 'home', 'plant', 'leaf', 'sparkles']],
];

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

const porNome = (a, b) => (a.archived - b.archived) || a.name.localeCompare(b.name, 'pt-BR');
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export function iniciarTags({ estado }) {
  const secao = document.querySelector('#tela-tags');
  const nova = criar('button', { type: 'button', class: 'btn btn-principal', id: 'tags-nova' },
    criar('i', { class: 'ti ti-plus', 'aria-hidden': 'true' }), 'Nova tag');
  const lista = criar('div', { id: 'tags-lista', class: 'tags-lista' });
  secao.replaceChildren(
    criar('div', { class: 'tags-topo' },
      criar('p', { class: 'suave', texto: 'Tags organizam cards e compromissos, como Idiomas. Subtags detalham uma tag (Vocabulário, Gramática) e aparecem junto dela nos filtros.' }),
      nova),
    lista);

  const janela = criar('div', { id: 'tag-janela', class: 'menu-camada', hidden: '' });
  document.body.append(janela);
  const fechar = () => { janela.hidden = true; janela.replaceChildren(); document.body.classList.remove('sem-rolagem'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !janela.hidden) fechar(); });

  function abrirJanela(titulo, ...conteudo) {
    const fundo = criar('div', { class: 'menu-fundo' });
    fundo.addEventListener('click', fechar);
    const painel = criar('form', { class: 'menu-folha tag-painel', novalidate: '' }, criar('h3', { texto: titulo }), ...conteudo);
    painel.addEventListener('submit', (e) => e.preventDefault());
    janela.replaceChildren(fundo, painel);
    janela.hidden = false;
    document.body.classList.add('sem-rolagem');
    return painel;
  }

  // Criar (tag ou subtag de `mae`) ou editar `tag`.
  function abrirFormulario({ tag = null, mae = null }) {
    const parentId = tag ? tag.parent_id || null : mae?.id || null;
    let icone = tag?.icon || mae?.icon || 'tag';
    const nome = criar('input', { id: 'tag-nome', type: 'text', maxlength: '60', autocomplete: 'off', placeholder: mae ? 'Vocabulário' : 'Idiomas' });
    nome.value = tag?.name || '';
    const cor = seletorDeCor(tag?.color || mae?.color || '#C68B59', () => {}, CORES_TAG);
    const icones = criar('div', { class: 'grupos-icones' }, ...GRUPOS_ICONES.map(([grupo, nomes]) =>
      criar('div', { class: 'grupo-icones' }, criar('div', { class: 'suave', texto: grupo }),
        criar('div', { class: 'icones' }, ...nomes.map((i) => {
          const b = criar('button', { type: 'button', 'data-icone': i, 'aria-label': i, 'aria-pressed': String(i === icone) },
            criar('i', { class: `ti ti-${i}`, 'aria-hidden': 'true' }));
          b.addEventListener('click', () => {
            icone = i;
            icones.querySelectorAll('[data-icone]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.icone === i)));
          });
          return b;
        })))));
    const erro = criar('div', { class: 'erro', id: 'tag-erro', role: 'alert' });
    const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'tag-salvar', texto: 'Salvar' });
    const cancelar = criar('button', { type: 'button', class: 'btn', id: 'tag-cancelar', texto: 'Cancelar' });
    cancelar.addEventListener('click', fechar);
    const titulo = tag ? (tag.parent_id ? 'Editar subtag' : 'Editar tag') : mae ? `Nova subtag em ${mae.name}` : 'Nova tag';
    abrirJanela(titulo,
      criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome),
      criar('div', { class: 'campo' }, criar('span', { texto: 'Cor' }), cor.el),
      criar('div', { class: 'campo' }, criar('span', { texto: 'Ícone' }), icones),
      erro, criar('div', { class: 'linha-botoes' }, salvar, cancelar));
    nome.focus();

    let ocupado = false;
    salvar.addEventListener('click', async () => {
      if (ocupado) return;
      const texto = nome.value.trim();
      if (!texto) { erro.textContent = 'Dê um nome à tag.'; return; }
      if (nomeRepetido(estado.dados.categories, texto, parentId, tag?.id || null)) {
        erro.textContent = parentId ? 'Já existe uma subtag com esse nome nesta tag.' : 'Já existe uma tag com esse nome.';
        return;
      }
      ocupado = true; salvar.disabled = true; erro.textContent = '';
      try {
        const campos = { name: texto, color: cor.valor(), icon: icone };
        if (tag) await estado.alterar('categories', tag.id, campos);
        else await estado.criar('categories', { ...campos, parent_id: parentId });
        fechar();
      } catch (err) {
        erro.textContent = err.message || 'Não foi possível salvar.';
      } finally {
        ocupado = false; salvar.disabled = false;
      }
    });
  }

  async function arquivar(tag, arquivada) {
    try {
      await estado.alterar('categories', tag.id, { archived: arquivada });
      // Arquivar a mãe leva as subtags; desarquivar a mãe não traz as subtags de volta sozinho.
      if (arquivada && !tag.parent_id) {
        for (const f of filhasDe(estado.dados.categories, tag.id)) await estado.alterar('categories', f.id, { archived: true });
      }
    } catch (err) {
      abrirJanela('Não foi possível salvar', criar('p', { texto: err.message || 'Tente de novo.' }));
    }
  }

  function confirmarExclusao(tag) {
    const subs = filhasDe(estado.dados.categories, tag.id, { incluirArquivadas: true });
    const ids = new Set([tag.id, ...subs.map((s) => s.id)]);
    const d = estado.dados;
    const cards = new Set(d.card_categories.filter((cc) => ids.has(cc.category_id)).map((cc) => cc.card_id)).size;
    const blocos = d.blocks.filter((b) => ids.has(b.category_id)).length + d.commitments.filter((c) => ids.has(c.category_id)).length;
    const partes = [];
    if (subs.length) partes.push(`${plural(subs.length, 'subtag', 'subtags')} dentro dela também ${subs.length === 1 ? 'será excluída' : 'serão excluídas'}`);
    partes.push(cards ? `${plural(cards, 'card fica', 'cards ficam')} sem essa tag` : 'nenhum card usa essa tag');
    partes.push(blocos ? `${plural(blocos, 'compromisso fica', 'compromissos ficam')} sem tag` : 'nenhum compromisso usa essa tag');
    const erro = criar('div', { class: 'erro', role: 'alert' });
    const confirmar = criar('button', { type: 'button', class: 'btn perigo', id: 'tag-excluir-confirmar', texto: 'Excluir' });
    const cancelar = criar('button', { type: 'button', class: 'btn', id: 'tag-cancelar', texto: 'Cancelar' });
    cancelar.addEventListener('click', fechar);
    confirmar.addEventListener('click', async () => {
      confirmar.disabled = true;
      try { await estado.excluir('categories', tag.id); fechar(); } catch (err) { erro.textContent = err.message || 'Não foi possível excluir.'; confirmar.disabled = false; }
    });
    abrirJanela(`Excluir “${tag.name}”?`,
      criar('p', { texto: `${partes.join('; ')}. Isso não pode ser desfeito.` }),
      criar('p', { class: 'suave', texto: 'Para só esconder dos formulários e manter o histórico, use Arquivar.' }),
      erro, criar('div', { class: 'linha-botoes' }, confirmar, cancelar));
  }

  function bolinha(tag) {
    const b = criar('span', { class: 'tag-bolinha', 'aria-hidden': 'true' },
      criar('i', { class: `ti ti-${/^[a-z0-9-]{1,40}$/.test(tag.icon || '') ? tag.icon : 'tag'}` }));
    const cor = /^#[0-9a-f]{6}$/i.test(tag.color || '') ? tag.color : '#6F4E37';
    b.style.background = cor;
    b.style.color = corDoTexto(cor.toUpperCase());
    return b;
  }

  function acoes(tag) {
    const botao = (classe, icone, rotulo, aoClicar) => {
      const b = criar('button', { type: 'button', class: `btn-icone ${classe}`, 'aria-label': `${rotulo} ${tag.name}`, title: rotulo },
        criar('i', { class: `ti ti-${icone}`, 'aria-hidden': 'true' }));
      b.addEventListener('click', aoClicar);
      return b;
    };
    return [
      botao('tag-editar', 'pencil', 'Editar', () => abrirFormulario({ tag })),
      tag.archived
        ? botao('tag-desarquivar', 'archive-off', 'Desarquivar', () => arquivar(tag, false))
        : botao('tag-arquivar', 'archive', 'Arquivar', () => arquivar(tag, true)),
      botao('tag-excluir', 'trash', 'Excluir', () => confirmarExclusao(tag)),
    ];
  }

  function desenhar() {
    const todas = estado.dados.categories;
    const maes = todas.filter((c) => !c.parent_id).sort(porNome);
    if (!maes.length) {
      lista.replaceChildren(criar('div', { class: 'cartao vazio', texto: 'Crie a primeira tag, como Idiomas ou Exatas.' }));
      return;
    }
    lista.replaceChildren(...maes.map((t) => {
      const subs = todas.filter((c) => c.parent_id === t.id).sort(porNome);
      const bloco = criar('div', { class: `cartao tag-bloco${t.archived ? ' tag-arquivada' : ''}`, 'data-tag': t.id },
        criar('div', { class: 'tag-topo' }, bolinha(t), criar('span', { class: 'tag-nome', texto: t.name }), ...acoes(t)),
        ...(t.archived ? [criar('div', { class: 'suave', texto: 'Arquivada' })] : []),
        criar('div', { class: 'tag-subs' }, ...subs.map((s) => criar('div', { class: `tag-linha sub-linha${s.archived ? ' tag-arquivada' : ''}`, 'data-tag': s.id },
          bolinha(s), criar('span', { class: 'tag-nome', texto: s.archived ? `${s.name} (arquivada)` : s.name }), ...acoes(s)))));
      if (!t.archived) {
        const sub = criar('button', { type: 'button', class: 'btn btn-mini tag-nova-subtag', 'aria-label': `Nova subtag em ${t.name}` },
          criar('i', { class: 'ti ti-plus', 'aria-hidden': 'true' }), 'Subtag');
        sub.addEventListener('click', () => abrirFormulario({ mae: t }));
        bloco.append(sub);
      }
      return bloco;
    }));
  }

  nova.addEventListener('click', () => abrirFormulario({}));
  registrarTela('tags', { mostrar: desenhar });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}

