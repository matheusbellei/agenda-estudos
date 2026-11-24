import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('css/estilos.css', 'utf8');
const bloco = (seletor) => {
  const i = css.indexOf(`${seletor} {`);
  assert.ok(i >= 0, `falta o bloco ${seletor}`);
  return css.slice(i, css.indexOf('}', i));
};
const vars = (texto) => Object.fromEntries([...texto.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const claro = vars(bloco(':root'));
const escuro = { ...claro, ...vars(bloco(':root[data-tema="escuro"]')) };

const lum = (hex) => {
  const [r, g, b] = hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const PARES = [
  ['espresso', 'creme'], ['espresso', 'espuma'], ['texto-suave', 'espuma'], ['texto-suave', 'creme'], ['mocha', 'espuma'],
  ['barra-texto', 'barra'], ['barra-suave', 'barra'], ['espuma', 'espresso'], ['espresso', 'latte'], ['cumprido-texto', 'verde-claro'], ['nao-feito-texto', 'rosa-claro'],
];

for (const [nome, tema] of [['claro', claro], ['escuro', escuro]]) {
  test(`tema ${nome}: texto com contraste de pelo menos 4,5:1`, () => {
    for (const [t, f] of PARES) {
      assert.ok(tema[t] && tema[f], `faltam --${t} ou --${f}`);
      const c = contraste(tema[t], tema[f]);
      assert.ok(c >= 4.5, `--${t} sobre --${f} no tema ${nome}: ${c.toFixed(2)}`);
    }
  });
}

test('tema escuro redefine as cores principais', () => {
  for (const v of ['creme', 'espuma', 'espresso', 'latte', 'barra', 'borda-campo', 'sombra-rgb']) {
    assert.notEqual(escuro[v], claro[v], `--${v} igual nos dois temas`);
  }
});

test('nenhuma cor fixa fora das variáveis (só o #000 das máscaras)', () => {
  const resto = css.replace(bloco(':root'), '').replace(bloco(':root[data-tema="escuro"]'), '');
  const achadas = [...resto.matchAll(/#[0-9a-f]{3,8}\b|rgba?\(\s*\d/gi)].map((m) => m[0]).filter((c) => c !== '#000');
  assert.deepEqual(achadas, []);
});

test('--latte é cor de fundo: nunca é usada como cor de texto', () => {
  assert.deepEqual([...css.matchAll(/(?<![-\w])color:\s*var\(--latte\)/g)].map((m) => m[0]), []);
});

test('tema escuro cuida do editor de notas (janela de link, tabelas e ícones)', () => {
  for (const s of ['.toastui-editor-popup', '.toastui-editor-contents table', '.toastui-editor-toolbar-icons']) {
    assert.ok(css.includes(`:root[data-tema="escuro"] ${s}`) || css.includes(`[data-tema="escuro"] .notas-editor ${s}`), s);
  }
});
