import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gerar } from '../../scripts/gerar-funcao.mjs';

const atual = readFileSync(new URL('../../supabase/functions/lembretes/index.ts', import.meta.url), 'utf8');

test('index.ts commitado é o gerado agora (rode npm run gerar-funcao se falhar)', async () => {
  assert.equal(atual, await gerar());
});

test('index.ts não tem import externo nem chave escrita', () => {
  assert.doesNotMatch(atual, /^\s*import\s/m);
  assert.doesNotMatch(atual, /sb_secret_[A-Za-z0-9]|eyJhbGciOi/);
  assert.match(atual, /Deno\.serve\(/);
});
