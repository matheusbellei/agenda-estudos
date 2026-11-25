// Formatação curta dos flashcards: **negrito**, *itálico*, ==destaque==, listas com "- " ou "* " e quebras de linha.
// Todo o resto é escapado: o texto do usuário nunca vira HTML.
const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// O editor visual escreve "\*" para um asterisco de verdade: vira um marcador neutro antes de formatar
// e volta a ser o caractere no fim (assim não abre negrito nem itálico).
const ESCAPE = /\\([\\`*_{}[\]()#+\-.!|~=<>])/g;
const guardar = (t) => t.replace(ESCAPE, (_, c) => `\uE000${c.charCodeAt(0)}\uE001`);
const devolver = (t, f = (c) => c) => t.replace(/\uE000(\d+)\uE001/g, (_, n) => f(String.fromCharCode(Number(n))));
const LISTA = /^\s*[-*] /;

const inline = (t) => devolver(escapar(guardar(t))
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/==(.+?)==/g, '<mark>$1</mark>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>'), escapar);

export function marcacaoParaHtml(texto) {
  const partes = [];
  let paragrafo = [];
  let lista = [];
  const fecharParagrafo = () => { if (paragrafo.length) partes.push(`<p>${paragrafo.map(inline).join('<br>')}</p>`); paragrafo = []; };
  const fecharLista = () => { if (lista.length) partes.push(`<ul>${lista.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); lista = []; };
  for (const linha of String(texto || '').split('\n')) {
    if (LISTA.test(linha)) { fecharParagrafo(); lista.push(linha.replace(LISTA, '')); continue; }
    fecharLista();
    if (!linha.trim()) { fecharParagrafo(); continue; }
    paragrafo.push(linha);
  }
  fecharParagrafo(); fecharLista();
  return partes.join('');
}

// O texto puro, sem as marcas (para comparar a resposta digitada).
// `escapes: false`: texto puro (a resposta do "digitar" vem de uma caixa simples): barra e "* " ficam como estão.
export function semMarcacao(texto, { escapes = true } = {}) {
  if (!escapes) {
    return String(texto || '').replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1').replace(/==(\S(?:.*?\S)?)==/g, '$1')
      .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=$|[\s.,;:!?)])/g, '$1$2');
  }
  return devolver(guardar(String(texto || '')).split('\n').map((l) => l.replace(LISTA, ''))
    .join('\n').replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1').replace(/==(\S(?:.*?\S)?)==/g, '$1').replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=$|[\s.,;:!?)])/g, '$1$2'));
}

// O editor visual (Toast UI) escreve "<br>" em linhas vazias seguidas e em item de lista vazio, e às vezes escapa
// as chaves das lacunas ("\{\{x\}\}"). Antes de gravar: linha só com <br> sai, <br> no meio vira quebra,
// e as chaves voltam a ser chaves. O resto dos escapes fica (a formatação os entende).
export function limparSaidaDoEditor(md) {
  return String(md || '')
    .split('\n').filter((l) => !/^\s*<br\s*\/?>\s*$/i.test(l)).join('\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\([{}])/g, '$1')
    .replace(/\n{3,}/g, '\n\n');
}
