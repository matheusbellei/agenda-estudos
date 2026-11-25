import test from 'node:test';
import assert from 'node:assert/strict';
import { marcacaoParaHtml, semMarcacao, limparSaidaDoEditor } from '../../js/regras/marcacao.js';

test('escapa todo HTML do usuário', () => {
  assert.equal(marcacaoParaHtml('<img src=x onerror="alert(1)">'), '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>');
  assert.equal(marcacaoParaHtml("a & b 'c'"), '<p>a &amp; b &#39;c&#39;</p>');
});

test('negrito, itálico, destaque e quebras', () => {
  assert.equal(marcacaoParaHtml('**tener** é *irregular*'), '<p><strong>tener</strong> é <em>irregular</em></p>');
  assert.equal(marcacaoParaHtml('yo ==tuve== un perro'), '<p>yo <mark>tuve</mark> un perro</p>');
  assert.equal(marcacaoParaHtml('linha 1\nlinha 2'), '<p>linha 1<br>linha 2</p>');
  assert.equal(marcacaoParaHtml('a\n\nb'), '<p>a</p><p>b</p>');
});

test('listas com "- "', () => {
  assert.equal(marcacaoParaHtml('Verbos:\n- tener\n- **ir**\nfim'), '<p>Verbos:</p><ul><li>tener</li><li><strong>ir</strong></li></ul><p>fim</p>');
});

test('vazio e semMarcacao', () => {
  assert.equal(marcacaoParaHtml(''), '');
  assert.equal(semMarcacao('**tener** *x* ==y==\n- z'), 'tener x y\nz');
});

// ---- saída do editor visual (Toast UI): escapes e listas com "* "
test('marcacaoParaHtml: escapes do editor viram o próprio caractere e não formatam', () => {
  assert.equal(marcacaoParaHtml('2\\*3 a\\_b'), '<p>2*3 a_b</p>');
  assert.equal(marcacaoParaHtml('**\\*x\\***'), '<p><strong>*x*</strong></p>');
  assert.equal(marcacaoParaHtml('\\*não\\* itálico'), '<p>*não* itálico</p>');
});

test('marcacaoParaHtml: lista com "* " (editor) e itálico no começo da linha não vira lista', () => {
  assert.equal(marcacaoParaHtml('* um\n* dois'), '<ul><li>um</li><li>dois</li></ul>');
  assert.equal(marcacaoParaHtml('*ital* x'), '<p><em>ital</em> x</p>');
});

test('semMarcacao: tira escapes e o "* " das listas', () => {
  assert.equal(semMarcacao('2\\*3'), '2*3');
  assert.equal(semMarcacao('* um'), 'um');
});

test('limparSaidaDoEditor: tira <br> do editor visual e os escapes das lacunas', () => {
  assert.equal(limparSaidaDoEditor('um\n\n<br>\n<br>\ndois'), 'um\n\ndois');
  assert.equal(limparSaidaDoEditor('* um<br>dois'), '* um\ndois');
  assert.equal(limparSaidaDoEditor('Yo \\{\\{tuve\\}\\} un perro | x'), 'Yo {{tuve}} un perro | x');
  assert.equal(limparSaidaDoEditor('2\\*3'), '2\\*3');
});

test('semMarcacao com escapes: false mantém a barra (resposta digitada é texto puro)', () => {
  assert.equal(semMarcacao('a\\.b', { escapes: false }), 'a\\.b');
  assert.equal(semMarcacao('* x', { escapes: false }), '* x');
  assert.equal(semMarcacao('**Perro**', { escapes: false }), 'Perro');
});
