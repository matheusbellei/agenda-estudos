import test from 'node:test';
import assert from 'node:assert/strict';
import { temHtmlCru } from '../../js/regras/markdown.js';

test('temHtmlCru: tags HTML no texto', () => {
  assert.equal(temHtmlCru('Texto <u>sublinhado</u> fim'), true);
  assert.equal(temHtmlCru('<details>\n<summary>Resumo</summary>\n\nconteúdo\n</details>\n'), true);
  assert.equal(temHtmlCru('<img src=x onerror="window.__xss=1">'), true);
  assert.equal(temHtmlCru('a <span style="color:red">vermelho</span>'), true);
  assert.equal(temHtmlCru('linha<br>outra'), true);
  assert.equal(temHtmlCru('fim </span>'), true);
  assert.equal(temHtmlCru('antes <!-- comentário --> depois'), true);
});

test('temHtmlCru: código, autolinks e sinais soltos não contam', () => {
  assert.equal(temHtmlCru('```html\n<u>x</u>\n<div>\n```\n'), false);
  assert.equal(temHtmlCru('~~~\n<b>x</b>\n~~~'), false);
  assert.equal(temHtmlCru('use `<u>` para sublinhar e ``<b>`` também'), false);
  assert.equal(temHtmlCru('veja <https://exemplo.com> e <email@x.com>'), false);
  assert.equal(temHtmlCru('a < b e c > d'), false);
  assert.equal(temHtmlCru('x<3 e 5>2'), false);
  assert.equal(temHtmlCru('# Título\n\n- _**item**_\n\n1. um\n\n![img](anexo:u1/c/a.png) [l](https://x.com)'), false);
  assert.equal(temHtmlCru(''), false);
});

test('temHtmlCru: HTML fora do bloco de código ainda conta', () => {
  assert.equal(temHtmlCru('```\ncódigo\n```\n\n<u>depois</u>'), true);
});
