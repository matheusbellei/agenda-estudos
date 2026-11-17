// Imagens anexadas ficam na anotação como `![nome](anexo:CAMINHO)`; para exibir, o caminho vira uma URL temporária.
// O texto alternativo pode ter caracteres escapados (o editor escreve `\[` e `\]`).
const ALT = String.raw`!\[(?:\\.|[^\]\\])*\]\(`;
const IMAGEM_ANEXO = new RegExp(`(${ALT})anexo:([^)]*)(\\))`, 'g');

export function caminhosNoMarkdown(md) {
  return [...String(md || '').matchAll(IMAGEM_ANEXO)].map((m) => m[2]);
}

export function comEnderecos(md, mapa) {
  return String(md || '').replace(IMAGEM_ANEXO, (tudo, abre, caminho, fecha) =>
    (Object.hasOwn(mapa, caminho) ? abre + mapa[caminho] + fecha : tudo));
}

export function semEnderecos(md, mapa) {
  const porUrl = new Map(Object.entries(mapa).map(([caminho, url]) => [url, caminho]));
  if (!porUrl.size) return String(md || '');
  const trocado = String(md || '').replace(new RegExp(`(${ALT})([^)\\s]*)(\\))`, 'g'), (tudo, abre, url, fecha) =>
    (porUrl.has(url) ? `${abre}anexo:${porUrl.get(url)}${fecha}` : tudo));
  // Rede de segurança: uma URL temporária nunca vai para o banco, em qualquer formato que o editor a tenha escrito.
  let resto = trocado;
  for (const [url, caminho] of porUrl) if (url) resto = resto.split(url).join(`anexo:${caminho}`);
  return resto;
}

// Texto alternativo de uma imagem nova: sem colchetes, que o editor escaparia.
export function altSemColchetes(nome) {
  return String(nome || '').replace(/[[\]]/g, '') || 'imagem';
}

// Nome usado no caminho do Storage: sem acentos, espaços ou símbolos (o nome original fica na linha do anexo).
export function nomeParaCaminho(nome) {
  const limpo = String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-');
  return limpo || 'arquivo';
}
