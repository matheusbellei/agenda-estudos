import test from 'node:test';
import assert from 'node:assert/strict';
import { marcacaoParaHtml, semMarcacao } from '../../js/regras/marcacao.js';

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
