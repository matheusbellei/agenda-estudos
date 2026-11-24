import test from 'node:test';
import assert from 'node:assert/strict';
import { graficoBarras, graficoMapa } from '../../js/telas/graficos.js';

const conta = (s, re) => (s.match(re) || []).length;

test('graficoBarras: acessível, uma barra de cada por item, cumprido não passa do planejado', () => {
  const barras = Array.from({ length: 7 }, (_, i) => ({ rotulo: 'STQQSSD'[i], planejado_min: 60 * (i + 1), cumprido_min: 30 * i }));
  const svg = graficoBarras(barras, 'Horas <por> dia');
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Horas &lt;por&gt; dia"/);
  assert.equal(conta(svg, /class="g-planejado"/g), 7);
  assert.equal(conta(svg, /class="g-cumprido"/g), 7);
  const alturas = (cls) => [...svg.matchAll(new RegExp(`class="${cls}"[^>]*height="([\\d.]+)"`, 'g'))].map((m) => Number(m[1]));
  alturas('g-cumprido').forEach((h, i) => assert.ok(h <= alturas('g-planejado')[i]));
});

test('graficoBarras: tudo zero não gera NaN', () => {
  const svg = graficoBarras([{ rotulo: 'S', planejado_min: 0, cumprido_min: 0 }], 'x');
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('graficoMapa: 21 células com a classe pela taxa de não feito', () => {
  const celulas = Array.from({ length: 7 }, () => Array.from({ length: 3 }, () => ({ terminados: 0, nao_feitos: 0 })));
  celulas[2][2] = { terminados: 2, nao_feitos: 2 };
  const svg = graficoMapa(celulas, 'Mapa');
  assert.equal(conta(svg, /data-celula="/g), 21);
  assert.match(svg, /class="g-mapa-3" data-celula="2-2"/);
  assert.match(svg, /class="g-mapa-vazio" data-celula="0-0"/);
  assert.match(svg, />Noite</);
});
