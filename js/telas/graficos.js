// Gráficos do acompanhamento: SVG gerado como texto, cores pelas classes g-* do style.css.
import { classeDaCelula } from '../regras/acompanhamento.js';

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v) => Math.round(v * 10) / 10;

// Barra clara = planejado; verde por cima = cumprido. Rótulos embaixo.
export function graficoBarras(barras, descricao) {
  const L = 320; const A = 120; const base = A - 18;
  const maior = Math.max(1, ...barras.map((b) => Math.max(b.planejado_min, b.cumprido_min)));
  const passo = L / Math.max(1, barras.length);
  const largura = Math.max(3, Math.min(18, passo * 0.55));
  const partes = barras.map((b, i) => {
    const x = n(i * passo + (passo - largura) / 2);
    const hp = n((Math.max(b.planejado_min, b.cumprido_min) / maior) * (base - 4));
    const hc = n((b.cumprido_min / maior) * (base - 4));
    const meio = n(i * passo + passo / 2);
    return `<rect class="g-planejado" x="${x}" y="${n(base - hp)}" width="${n(largura)}" height="${hp}" rx="2"></rect>`
      + `<rect class="g-cumprido" x="${x}" y="${n(base - hc)}" width="${n(largura)}" height="${hc}" rx="2"></rect>`
      + (barras.length <= 16 || i % Math.ceil(barras.length / 12) === 0
        ? `<text class="g-rotulo" x="${meio}" y="${A - 4}" text-anchor="middle">${esc(b.rotulo)}</text>` : '');
  }).join('');
  return `<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${esc(descricao)}">${partes}</svg>`;
}

const DIAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const FAIXAS = ['Manhã', 'Tarde', 'Noite'];

export function graficoMapa(celulas, descricao) {
  const esq = 48; const topo = 16; const lado = 36; const alto = 22; const folga = 3;
  let s = DIAS.map((d, i) => `<text class="g-rotulo" x="${esq + i * lado + (lado - folga) / 2}" y="11" text-anchor="middle">${d}</text>`).join('');
  FAIXAS.forEach((f, fi) => {
    const y = topo + fi * (alto + folga);
    s += `<text class="g-rotulo" x="0" y="${y + 15}">${f}</text>`;
    for (let di = 0; di < 7; di += 1) {
      s += `<rect class="g-mapa-${classeDaCelula(celulas[di][fi])}" data-celula="${di}-${fi}" x="${esq + di * lado}" y="${y}" width="${lado - folga}" height="${alto}" rx="3"></rect>`;
    }
  });
  const L = esq + 7 * lado; const A = topo + 3 * (alto + folga);
  return `<svg class="grafico" viewBox="0 0 ${L} ${A}" role="img" aria-label="${esc(descricao)}">${s}</svg>`;
}
