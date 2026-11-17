// Editor das anotações: Toast UI Editor no modo visual, ou uma caixa de texto com o Markdown cru.
// Regra central: enquanto o usuário não mexe, `markdown()` devolve exatamente o texto recebido;
// a normalização que a biblioteca faz ao carregar nunca volta para o banco.

import { temHtmlCru } from './regras/markdown.js';
import { altSemColchetes } from './regras/anexos.js';

const AVISO_HTML = 'Esta anotação tem HTML. Ela abre em modo texto para nada se perder.';
const BARRA = [['heading', 'bold', 'italic'], ['ul', 'ol'], ['link', 'image']];
const GESTOS = ['keydown', 'paste', 'drop', 'cut', 'pointerdown'];

// Sem `markdown`, diz se a biblioteca está disponível; com ele, se aquela anotação abre no modo visual.
// O editor visual apaga HTML cru ao gerar o Markdown, então anotação com HTML abre em modo texto.
export function modoVisual(markdown = '') {
  return !window.__EDITOR_SIMPLES__ && !!(window.toastui && window.toastui.Editor) && !temHtmlCru(markdown);
}

export function criarEditor(el, { markdown = '', aoMudar = () => {}, aoColarImagem } = {}) {
  if (modoVisual(markdown)) return editorVisual(el, markdown, aoMudar, aoColarImagem);
  const avisar = modoVisual() && temHtmlCru(markdown);
  return editorSimples(el, markdown, aoMudar, avisar ? AVISO_HTML : '');
}

function editorSimples(el, markdown, aoMudar, aviso) {
  let original = markdown || '';
  const area = document.createElement('textarea');
  area.className = 'editor-simples';
  area.rows = 5;
  area.setAttribute('aria-label', 'Anotações');
  area.value = original;
  area.addEventListener('input', () => aoMudar(area.value));
  el.replaceChildren(...(aviso ? [Object.assign(document.createElement('p'), { className: 'suave aviso-html', textContent: aviso })] : []), area);
  return {
    markdown: () => area.value,
    alterado: () => area.value !== original,
    definir(md) { original = md || ''; area.value = original; },
    destruir: () => el.replaceChildren(),
  };
}

// O Toast UI 3.2.3 apaga quebras de linha forçadas ("  " ou "\\" no fim da linha) ao gerar o Markdown,
// colando as palavras ("duro  \nfim" vira "durofim"). Fora de blocos de código, viram quebras simples.
function semQuebrasForcadas(md) {
  let emCodigo = false;
  return md.split('\n').map((linha) => {
    if (/^\s*(```|~~~)/.test(linha)) emCodigo = !emCodigo;
    return emCodigo ? linha : linha.replace(/( {2,}|\\)$/, '');
  }).join('\n');
}

function editorVisual(el, markdown, aoMudar, aoColarImagem) {
  let original = markdown || '';
  let base = '';      // como a biblioteca escreve `original`: só serve para saber se o usuário mudou algo
  let mexeu = false;  // houve gesto do usuário dentro do editor desde o último `definir`
  let vivo = true;
  const caixa = document.createElement('div');
  el.replaceChildren(caixa);

  const ed = new window.toastui.Editor({
    el: caixa,
    initialValue: semQuebrasForcadas(original),
    initialEditType: 'wysiwyg',
    hideModeSwitch: true,
    usageStatistics: false,
    autofocus: false,
    language: 'pt-BR',
    height: 'auto',
    minHeight: '160px',
    toolbarItems: BARRA,
    hooks: {
      addImageBlobHook(arquivo, inserir) {
        if (!aoColarImagem) return;
        mexeu = true;
        aoColarImagem(arquivo).then((url) => { if (vivo && url) inserir(url, altSemColchetes(arquivo.name)); }, () => {});
      },
    },
  });
  base = ed.getMarkdown();

  const marcar = () => { mexeu = true; };
  GESTOS.forEach((g) => el.addEventListener(g, marcar, true));
  // A biblioteca não fecha os balões (link, imagem, título) com Esc; aqui Esc fecha só o balão.
  const escBalao = (e) => {
    if (e.key !== 'Escape' || ![...el.querySelectorAll('.toastui-editor-popup')].some((p) => p.offsetParent)) return;
    e.stopPropagation();
    ed.eventEmitter.emit('closePopup');
  };
  el.addEventListener('keydown', escBalao);
  const alterado = () => mexeu && ed.getMarkdown() !== base;
  ed.on('change', () => {
    // Mudança sem gesto (ajuste interno da biblioteca) só atualiza a referência.
    if (!mexeu) { base = ed.getMarkdown(); return; }
    aoMudar(alterado() ? ed.getMarkdown() : original);
  });

  return {
    markdown: () => (alterado() ? ed.getMarkdown() : original),
    alterado,
    definir(md) {
      original = md || '';
      mexeu = false;
      ed.setMarkdown(semQuebrasForcadas(original), false);
      base = ed.getMarkdown();
    },
    destruir() {
      vivo = false;
      GESTOS.forEach((g) => el.removeEventListener(g, marcar, true));
      el.removeEventListener('keydown', escBalao);
      ed.destroy();
      el.replaceChildren();
    },
  };
}
