import test from 'node:test';
import assert from 'node:assert/strict';
import { caminhosNoMarkdown, comEnderecos, semEnderecos, nomeParaCaminho, altSemColchetes } from '../../js/regras/anexos.js';

const MD = '# Aula\n\n![quadro](anexo:u1/c1/aaa-quadro.png)\n\ntexto\n\n![foto 2](anexo:u1/c1/bbb-foto.jpg) fim\n';
const MAPA = { 'u1/c1/aaa-quadro.png': 'https://x.supabase.co/sign/1?token=a&b=1', 'u1/c1/bbb-foto.jpg': 'https://x.supabase.co/sign/2?token=b' };

test('caminhosNoMarkdown: acha as imagens de anexo, na ordem', () => {
  assert.deepEqual(caminhosNoMarkdown(MD), ['u1/c1/aaa-quadro.png', 'u1/c1/bbb-foto.jpg']);
  assert.deepEqual(caminhosNoMarkdown(''), []);
});

test('ida e volta com duas imagens', () => {
  const com = comEnderecos(MD, MAPA);
  assert.ok(com.includes('![quadro](https://x.supabase.co/sign/1?token=a&b=1)'));
  assert.ok(com.includes('![foto 2](https://x.supabase.co/sign/2?token=b)'));
  assert.ok(!com.includes('anexo:'));
  assert.equal(semEnderecos(com, MAPA), MD);
});

test('texto sem imagem não muda', () => {
  const t = '# Título\n\n- _**item**_\n\n1. um\n';
  assert.equal(comEnderecos(t, MAPA), t);
  assert.equal(semEnderecos(t, MAPA), t);
});

test('link comum e imagem externa não são tocados', () => {
  const t = 'veja [x](https://exemplo.com) e ![y](https://trello.com/a.png)';
  assert.equal(comEnderecos(t, MAPA), t);
  assert.equal(semEnderecos(t, MAPA), t);
  assert.deepEqual(caminhosNoMarkdown(t), []);
});

test('caminho sem endereço no mapa fica como está', () => {
  const t = '![z](anexo:u1/c1/zzz.png)';
  assert.equal(comEnderecos(t, MAPA), t);
});

test('caminho com espaço e acento no nome', () => {
  const caminho = 'u1/c1/ccc-anotação da aula.png';
  const t = `antes ![anotação](anexo:${caminho}) depois`;
  const mapa = { [caminho]: 'https://x.supabase.co/sign/3?t=c' };
  assert.deepEqual(caminhosNoMarkdown(t), [caminho]);
  const com = comEnderecos(t, mapa);
  assert.equal(com, 'antes ![anotação](https://x.supabase.co/sign/3?t=c) depois');
  assert.equal(semEnderecos(com, mapa), t);
});

test('nomeParaCaminho: tira acentos, espaços e símbolos', () => {
  assert.equal(nomeParaCaminho('Anotação da aula (1).png'), 'Anotacao-da-aula-1-.png');
  assert.equal(nomeParaCaminho(''), 'arquivo');
});

test('nome com colchetes escapados (como o editor escreve) faz ida e volta', () => {
  const caminho = 'u1/c1/x-foto [1].png';
  const t = `antes ![foto \\[1\\].png](anexo:${caminho}) depois`;
  const mapa = { [caminho]: 'https://x.supabase.co/sign/9?t=z' };
  assert.deepEqual(caminhosNoMarkdown(t), [caminho]);
  const com = comEnderecos(t, mapa);
  assert.equal(com, 'antes ![foto \\[1\\].png](https://x.supabase.co/sign/9?t=z) depois');
  assert.equal(semEnderecos(com, mapa), t);
});

test('semEnderecos: URL temporária que sobrou fora do formato de imagem volta a ser anexo', () => {
  const mapa = { 'u1/c1/a.png': 'https://x.supabase.co/sign/1?token=a' };
  assert.equal(semEnderecos('![x](<https://x.supabase.co/sign/1?token=a>)', mapa), '![x](<anexo:u1/c1/a.png>)');
  assert.equal(semEnderecos('solta https://x.supabase.co/sign/1?token=a fim', mapa), 'solta anexo:u1/c1/a.png fim');
  assert.equal(semEnderecos('![a ] b](https://x.supabase.co/sign/1?token=a)', mapa), '![a ] b](anexo:u1/c1/a.png)');
});

test('altSemColchetes: tira [ e ] do texto alternativo', () => {
  assert.equal(altSemColchetes('foto [1].png'), 'foto 1.png');
  assert.equal(altSemColchetes(''), 'imagem');
});
