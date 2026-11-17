// Perguntas sobre o texto em Markdown das anotações (sem tocar na página).

// Tag de abertura/fechamento (`<u>`, `</span>`, `<img src=x>`, `<br/>`) ou comentário HTML.
// Autolinks (`<https://…>`, `<a@b.com>`) e sinais soltos (`a < b`) não casam: depois do nome da tag
// só pode vir espaço, `/` ou `>`.
const TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>|<!--/;

function semCodigo(md) {
  let cerca = null;
  const linhas = [];
  for (const linha of String(md || '').split('\n')) {
    const m = linha.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (cerca) { if (m && m[1][0] === cerca[0] && m[1].length >= cerca.length) cerca = null; continue; }
    if (m) { cerca = m[1]; continue; }
    linhas.push(linha);
  }
  // Trechos de código na linha: `x`, ``x`` (mesma quantidade de crases para abrir e fechar).
  return linhas.join('\n').replace(/(`+)[\s\S]*?\1/g, '');
}

// O editor visual apaga o HTML cru ao gerar o Markdown; notas com HTML abrem em modo texto.
export function temHtmlCru(md) {
  return TAG.test(semCodigo(md));
}
