// Tela Tags: tags e subtags (dois níveis) com cor e ícone, como no controle financeiro.
// Criar e editar numa janela; arquivar (a mãe leva as subtags) e excluir com confirmação.
import { registrarTela } from './casca.js';
import { seletorDeCor, corDoTexto } from './ajustes.js';
import { filhasDe, nomeRepetido } from '../regras/tags.js';
import { formatarHoras } from '../regras/acompanhamento.js';

export const CORES_TAG = [
  '#3B2416', '#6F4E37', '#8C5A3C', '#A0522D', '#C68B59', '#D4A373', '#B5543A', '#9C6644', '#7F5539', '#A68A73', '#E6CCB2', '#5C4033',
  '#C0392B', '#E74C3C', '#E57373', '#D35400', '#E67E22', '#F39C12', '#F1C40F', '#F7DC6F', '#B7950B', '#FF8A65',
  '#1E8449', '#27AE60', '#52BE80', '#5B7A3A', '#7A8B5A', '#A9DFBF', '#16A085', '#48C9B0', '#0E6655', '#82E0AA',
  '#1B4F72', '#2471A3', '#3498DB', '#5DADE2', '#85C1E9', '#2E86C1', '#154360', '#76D7C4',
  '#4A235A', '#6C3483', '#8E44AD', '#A569BD', '#C39BD3', '#D81B60', '#EC407A', '#F48FB1', '#AD1457', '#F8BBD0',
  '#212121', '#424242', '#616161', '#9E9E9E', '#BDBDBD', '#607D8B', '#90A4AE', '#795548',
  // tons pastel
  '#FADBD8', '#F5CBA7', '#FCF3CF', '#D5F5E3', '#D6EAF8', '#E8DAEF', '#FDEDEC', '#E9F7EF', '#EBF5FB', '#F4ECF7', '#FEF9E7', '#F2F3F4',
  // tons fortes e profundos
  '#641E16', '#78281F', '#6E2C00', '#7E5109', '#7D6608', '#145A32', '#0B5345', '#0E6251', '#1A5276', '#21618C', '#283747', '#1B2631',
  '#512E5F', '#4A148C', '#880E4F', '#B71C1C', '#E65100', '#33691E', '#006064', '#0D47A1', '#311B92', '#3E2723', '#263238', '#BF360C',
  // vivos
  '#00BCD4', '#009688', '#8BC34A', '#CDDC39', '#FFC107', '#FF5722', '#673AB7', '#3F51B5',
];

export const GRUPOS_ICONES = [
  ['Estudos', ['book', 'books', 'book-2', 'notebook', 'school', 'certificate', 'certificate-2', 'pencil', 'writing', 'highlight', 'clipboard', 'clipboard-list', 'clipboard-check', 'presentation', 'backpack', 'bookmark', 'bookmarks', 'notes', 'note', 'file-text', 'library', 'ruler-2', 'eraser', 'paperclip', 'abc']],
  ['Idiomas', ['language', 'alphabet-latin', 'alphabet-greek', 'alphabet-cyrillic', 'message-language', 'world', 'world-search', 'flag', 'flag-2', 'messages', 'message-circle', 'microphone', 'headphones', 'speakerphone', 'volume', 'ear', 'quote']],
  ['Exatas', ['math', 'math-function', 'math-symbols', 'math-integral', 'calculator', 'chart-line', 'chart-pie', 'chart-dots', 'function', 'infinity', 'percentage', 'square-root', 'sum', 'divide', 'plus-minus', 'variable', 'triangle', 'hexagon']],
  ['Ciências', ['atom', 'atom-2', 'flask', 'flask-2', 'dna', 'dna-2', 'microscope', 'planet', 'telescope', 'magnet', 'bolt', 'temperature', 'leaf', 'virus', 'cell', 'biohazard', 'meteor', 'comet']],
  ['Tecnologia', ['code', 'terminal-2', 'device-laptop', 'device-desktop', 'device-mobile', 'device-tablet', 'database', 'cpu', 'cloud', 'robot', 'brand-python', 'brand-javascript', 'brand-github', 'git-branch', 'api', 'bug', 'server', 'wifi', 'keyboard', 'binary', 'sitemap']],
  ['Humanas', ['building-bank', 'scale', 'gavel', 'users', 'user', 'brain', 'history', 'world-latitude', 'map', 'map-2', 'compass', 'globe', 'flag-3', 'building-monument']],
  ['Artes e música', ['palette', 'brush', 'paint', 'music', 'piano', 'microphone-2', 'movie', 'camera', 'photo', 'pencil-star', 'masks-theater', 'color-swatch', 'typography', 'vinyl']],
  ['Trabalho', ['briefcase', 'briefcase-2', 'chart-bar', 'report-money', 'coin', 'coins', 'cash', 'building', 'building-store', 'phone', 'mail', 'calendar', 'clock', 'target', 'presentation-analytics', 'id-badge-2', 'file-invoice', 'chart-arrows']],
  ['Vendas e dinheiro', ['pig-money', 'wallet', 'credit-card', 'receipt', 'shopping-cart', 'tag', 'discount', 'trending-up', 'trending-down', 'currency-real', 'moneybag', 'businessplan', 'cash-banknote', 'chart-candle']],
  ['Saúde e corpo', ['heart', 'heartbeat', 'activity', 'run', 'barbell', 'yoga', 'stretching', 'swimming', 'bike', 'walk', 'apple', 'salad', 'pill', 'stethoscope', 'first-aid-kit', 'dental', 'eye']],
  ['Rotina e casa', ['bed', 'coffee', 'sun', 'moon', 'sunrise', 'sunset', 'home', 'home-2', 'sofa', 'tools-kitchen-2', 'shopping-bag', 'basket', 'wash', 'clock-hour-4', 'alarm', 'hourglass']],
  ['Fé e vida', ['heart-handshake', 'building-church', 'candle', 'sparkles', 'star', 'flame', 'feather', 'peace', 'rainbow']],
  ['Família e pessoas', ['users-group', 'baby-carriage', 'friends', 'man', 'woman', 'mood-smile', 'mood-heart', 'paw', 'dog', 'cat', 'gift', 'cake', 'confetti', 'balloon']],
  ['Lazer', ['device-gamepad-2', 'puzzle', 'chess', 'dice', 'ticket', 'beach', 'mountain', 'tent', 'plane', 'car', 'bus', 'map-pin', 'camera-selfie', 'ball-football', 'ball-basketball', 'trophy']],
  ['Natureza', ['plant', 'plant-2', 'tree', 'trees', 'flower', 'seeding', 'cactus', 'mushroom', 'butterfly', 'fish', 'cloud-rain', 'snowflake', 'wind']],
  ['Outros', ['bulb', 'rocket', 'target-arrow', 'flag-check', 'pin', 'pinned', 'crown', 'anchor', 'key', 'lock', 'shield', 'bell', 'tags', 'circle', 'square', 'check', 'x']],
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

// Aberta pela tela Tags; o formulário do bloco usa para criar tag ou subtag sem sair dele.
let abrirFormularioFn = null;
export function criarTagPeloBloco({ mae = null, aoCriar, aoCancelar } = {}) {
  if (abrirFormularioFn) abrirFormularioFn({ mae, aoCriar, aoCancelar });
}

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
  // Quem abriu a janela (ex.: o bloco) fica sabendo como ela fechou.
  let aoFechar = null;
  const fechar = () => {
    janela.hidden = true; janela.replaceChildren();
    // a folha do bloco pode continuar aberta por baixo: ela cuida da própria rolagem
    if (!document.querySelector('#folha-bloco:not([hidden])')) document.body.classList.remove('sem-rolagem');
    const f = aoFechar; aoFechar = null; if (f) f();
  };
  // Esc fecha só esta janela, não a folha do bloco por baixo.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !janela.hidden) { e.stopImmediatePropagation(); fechar(); } });

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
  function abrirFormulario({ tag = null, mae = null, aoCriar = null, aoCancelar = null }) {
    aoFechar = aoCancelar;
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
    // Só a tag mãe escolhe se conta como estudo; a subtag segue a mãe.
    const maeDaTag = parentId ? estado.dados.categories.find((c) => c.id === parentId) : null;
    const estudo = criar('input', { type: 'checkbox', id: 'tag-estudo' });
    estudo.checked = !!tag?.conta_estudo;
    const campoEstudo = parentId
      ? criar('div', { class: 'suave', id: 'tag-estudo-herdado', texto: `Herdado de ${maeDaTag?.name || 'tag mãe'}: ${maeDaTag?.conta_estudo ? 'conta como estudo' : 'não conta como estudo'}` })
      : criar('label', { class: 'campo-check' }, estudo, criar('span', { texto: 'Conta como estudo (entra nos Dashboards)' }));
    const metaAtual = tag?.meta_semanal_min || 0;
    const metaH = criar('input', { id: 'tag-meta-h', type: 'number', min: '0', max: '168', inputmode: 'numeric', placeholder: 'h' });
    const metaM = criar('input', { id: 'tag-meta-m', type: 'number', min: '0', max: '59', step: '5', inputmode: 'numeric', placeholder: 'min' });
    metaH.value = metaAtual ? String(Math.floor(metaAtual / 60)) : '';
    metaM.value = metaAtual % 60 ? String(metaAtual % 60) : '';
    const campoMeta = criar('div', { class: 'campo' }, criar('span', { texto: 'Meta por semana (vazio = sem meta)' }),
      criar('div', { class: 'tag-meta-campos' }, metaH, criar('span', { texto: 'h' }), metaM, criar('span', { texto: 'min' })));
    const erro = criar('div', { class: 'erro', id: 'tag-erro', role: 'alert' });
    const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'tag-salvar', texto: 'Salvar' });
    const cancelar = criar('button', { type: 'button', class: 'btn', id: 'tag-cancelar', texto: 'Cancelar' });
    cancelar.addEventListener('click', fechar);
    const titulo = tag ? (tag.parent_id ? 'Editar subtag' : 'Editar tag') : mae ? `Nova subtag em ${mae.name}` : 'Nova tag';
    abrirJanela(titulo,
      criar('label', { class: 'campo' }, criar('span', { texto: 'Nome' }), nome),
      criar('div', { class: 'campo' }, criar('span', { texto: 'Cor' }), cor.el),
      criar('div', { class: 'campo' }, criar('span', { texto: 'Ícone' }), icones),
      campoEstudo, campoMeta,
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
      const h = Number(metaH.value || 0); const m = Number(metaM.value || 0);
      if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) { erro.textContent = 'Meta inválida.'; return; }
      const meta = Math.round(h * 60 + m);
      if (meta > 168 * 60) { erro.textContent = 'A meta passa de 168h por semana.'; return; }
      ocupado = true; salvar.disabled = true; erro.textContent = '';
      try {
        const campos = { name: texto, color: cor.valor(), icon: icone, meta_semanal_min: meta || null, ...(parentId ? {} : { conta_estudo: estudo.checked }) };
        if (tag) await estado.alterar('categories', tag.id, campos);
        else {
          const criada = await estado.criar('categories', { ...campos, parent_id: parentId });
          aoFechar = aoCriar ? () => aoCriar(criada) : null;
        }
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

  function marcas(tag) {
    const saida = [];
    if (tag.conta_estudo) saida.push(criar('i', { class: 'ti ti-book tag-estudo', title: 'Conta como estudo', 'aria-label': 'Conta como estudo' }));
    if (tag.meta_semanal_min) saida.push(criar('span', { class: 'tag-meta', texto: `meta ${formatarHoras(tag.meta_semanal_min)}/sem` }));
    return saida;
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
        criar('div', { class: 'tag-topo' }, bolinha(t), criar('span', { class: 'tag-nome', texto: t.name }), ...marcas(t), ...acoes(t)),
        ...(t.archived ? [criar('div', { class: 'suave', texto: 'Arquivada' })] : []),
        criar('div', { class: 'tag-subs' }, ...subs.map((s) => criar('div', { class: `tag-linha sub-linha${s.archived ? ' tag-arquivada' : ''}`, 'data-tag': s.id },
          bolinha(s), criar('span', { class: 'tag-nome', texto: s.archived ? `${s.name} (arquivada)` : s.name }), ...marcas(s), ...acoes(s)))));
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
  abrirFormularioFn = abrirFormulario;
  registrarTela('tags', { mostrar: desenhar });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}

