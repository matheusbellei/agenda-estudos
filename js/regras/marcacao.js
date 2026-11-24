// Formatação curta dos flashcards: **negrito**, *itálico*, ==destaque==, listas com "- " e quebras de linha.
// Todo o resto é escapado: o texto do usuário nunca vira HTML.
const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const inline = (t) => escapar(t)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/==(.+?)==/g, '<mark>$1</mark>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>');

export function marcacaoParaHtml(texto) {
  const partes = [];
  let paragrafo = [];
  let lista = [];
  const fecharParagrafo = () => { if (paragrafo.length) partes.push(`<p>${paragrafo.map(inline).join('<br>')}</p>`); paragrafo = []; };
  const fecharLista = () => { if (lista.length) partes.push(`<ul>${lista.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); lista = []; };
  for (const linha of String(texto || '').split('\n')) {
    if (/^\s*- /.test(linha)) { fecharParagrafo(); lista.push(linha.replace(/^\s*- /, '')); continue; }
    fecharLista();
    if (!linha.trim()) { fecharParagrafo(); continue; }
    paragrafo.push(linha);
  }
  fecharParagrafo(); fecharLista();
  return partes.join('');
}

// O texto puro, sem as marcas (para comparar a resposta digitada).
export function semMarcacao(texto) {
  return String(texto || '').split('\n').map((l) => l.replace(/^\s*- /, ''))
    .join('\n').replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '$1').replace(/==(\S(?:.*?\S)?)==/g, '$1').replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=$|[\s.,;:!?)])/g, '$1$2');
}
