import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ladosDoTipo, responder, filaDaSessao, paraHoje, pergunta, resposta, confereDigitado, validarFlashcard,
  limitesDe, textoDoAvisoFlash, serieFlash, acertoDoPeriodo, filaDoGrupo,
} from '../../js/regras/flash.js';

const HOJE = '2026-11-24';
const AJ = { flash_card_novos_dia: 20, flash_card_revisoes_dia: 200, flash_card_fator: 2.5 };
const flash = (id, extra = {}) => ({ id, baralho_id: 'B', card_id: null, tipo: 'basico', frente: `f-${id}`, verso: `v-${id}`, criado_em: `2026-11-01T00:00:0${id.length}Z`, ...extra });
const lado = (flashcard_id, extra = {}) => ({ id: `l-${flashcard_id}-${extra.lado || 'frente'}`, flashcard_id, lado: 'frente', intervalo: 0, vence: null, errado_em: null, introduzido_em: null, revisado_em: null, ...extra });

test('ladosDoTipo', () => {
  assert.deepEqual(ladosDoTipo('basico'), ['frente']);
  assert.deepEqual(ladosDoTipo('invertido'), ['frente', 'verso']);
  assert.deepEqual(ladosDoTipo('lacuna'), ['frente']);
  assert.deepEqual(ladosDoTipo('digitar'), ['frente']);
});

test('responder: 1 → 3 → 8 com fator 2,5; errou zera e o acerto seguinte dá 1', () => {
  let l = lado('a');
  let r = responder(l, true, { hoje: HOJE, fator: 2.5 });
  assert.deepEqual(r, { patch: { intervalo: 1, vence: '2026-11-25', introduzido_em: HOJE }, primeiraDoDia: true, eraNovo: true });
  l = { ...l, ...r.patch };
  r = responder(l, true, { hoje: '2026-11-25', fator: 2.5 });
  assert.deepEqual(r.patch, { intervalo: 3, vence: '2026-11-28', revisado_em: '2026-11-25' });
  assert.equal(r.eraNovo, false);
  l = { ...l, ...r.patch };
  r = responder(l, true, { hoje: '2026-11-28', fator: 2.5 });
  assert.deepEqual(r.patch, { intervalo: 8, vence: '2026-12-06', revisado_em: '2026-11-28' });
  l = { ...l, ...r.patch };
  r = responder(l, false, { hoje: '2026-12-06', fator: 2.5 });
  assert.deepEqual(r, { patch: { intervalo: 0, vence: '2026-12-06', errado_em: '2026-12-06', revisado_em: '2026-12-06' }, primeiraDoDia: true, eraNovo: false });
  l = { ...l, ...r.patch };
  r = responder(l, true, { hoje: '2026-12-06', fator: 2.5 });
  assert.deepEqual(r, { patch: { intervalo: 1, vence: '2026-12-07' }, primeiraDoDia: false, eraNovo: false });
});

test('responder: novo errado e depois certo no mesmo dia', () => {
  const r1 = responder(lado('a'), false, { hoje: HOJE, fator: 2.5 });
  assert.deepEqual(r1.patch, { intervalo: 0, vence: HOJE, errado_em: HOJE, introduzido_em: HOJE });
  const r2 = responder({ ...lado('a'), ...r1.patch }, true, { hoje: HOJE, fator: 2.5 });
  assert.deepEqual(r2, { patch: { intervalo: 1, vence: '2026-11-25' }, primeiraDoDia: false, eraNovo: false });
});

test('filaDaSessao: vencidos mais antigos, depois novos por criação, errados de hoje no fim; limites descontam o que já foi feito hoje', () => {
  const flashcards = [flash('n1'), flash('n22'), flash('n333'), flash('r1'), flash('r2'), flash('e1'), flash('ok'), flash('inv', { tipo: 'invertido' })];
  const lados = [
    lado('r1', { intervalo: 3, vence: '2026-11-23' }), lado('r2', { intervalo: 3, vence: '2026-11-20' }),
    lado('e1', { intervalo: 0, vence: HOJE, errado_em: HOJE, revisado_em: HOJE }),
    lado('ok', { intervalo: 1, vence: '2026-11-25', introduzido_em: HOJE }),
    lado('inv', { intervalo: 2, vence: '2026-11-24', lado: 'verso' }),
  ];
  const fila = filaDaSessao({ flashcards, lados, hoje: HOJE, limites: { novos: 3, revisoes: 200 } });
  assert.deepEqual(fila.map((x) => `${x.flashcard.id}:${x.lado}`), ['r2:frente', 'r1:frente', 'inv:verso', 'n1:frente', 'n22:frente', 'e1:frente']);
  const curta = filaDaSessao({ flashcards, lados, hoje: HOJE, limites: { novos: 0, revisoes: 2 } });
  assert.deepEqual(curta.map((x) => x.flashcard.id), ['r2', 'e1']);
});

test('limitesDe: do baralho ou dos ajustes para o card', () => {
  const baralhos = [{ id: 'B', novos_dia: 5, revisoes_dia: 50, fator: 2 }];
  assert.deepEqual(limitesDe(flash('a'), { baralhos, ajustes: AJ }), { novos: 5, revisoes: 50, fator: 2 });
  assert.deepEqual(limitesDe(flash('a', { baralho_id: null, card_id: 'K' }), { baralhos, ajustes: AJ }), { novos: 20, revisoes: 200, fator: 2.5 });
});

test('paraHoje soma baralhos e cards, já com os limites', () => {
  const dados = {
    baralhos: [{ id: 'B', novos_dia: 1, revisoes_dia: 200, fator: 2.5 }],
    flashcards: [flash('a'), flash('b'), flash('c', { baralho_id: null, card_id: 'K' })],
    flash_lados: [lado('b', { intervalo: 2, vence: '2026-11-22' })],
  };
  const r = paraHoje(dados, HOJE, AJ);
  assert.equal(r.total, 3);
  assert.deepEqual(r.porBaralho.get('B'), { novos: 1, revisar: 1 });
  assert.deepEqual(r.porCard.get('K'), { novos: 1, revisar: 0 });
});

test('paraHoje ignora flashcards de cards arquivados', () => {
  const dados = { baralhos: [], cards: [{ id: 'K', archived: true }, { id: 'J', archived: false }],
    flashcards: [flash('a', { baralho_id: null, card_id: 'K' }), flash('b', { baralho_id: null, card_id: 'J' })], flash_lados: [] };
  const r = paraHoje(dados, HOJE, AJ);
  assert.equal(r.total, 1);
  assert.equal(r.porCard.has('K'), false);
});

test('digitar: resposta de uma linha só; asterisco solto não some', () => {
  assert.equal(validarFlashcard({ tipo: 'digitar', frente: 'x', verso: 'linha 1\nlinha 2' }), 'A resposta exata precisa ser de uma linha só.');
  assert.equal(confereDigitado('2*3*4', flash('d', { tipo: 'digitar', verso: '2*3*4' })).acertou, true);
  assert.equal(confereDigitado('perro', flash('d', { tipo: 'digitar', verso: '**perro**' })).acertou, true);
});

test('pergunta e resposta por tipo', () => {
  assert.equal(pergunta(flash('a'), 'frente'), 'f-a');
  assert.equal(resposta(flash('a'), 'frente').texto, 'v-a');
  const inv = flash('i', { tipo: 'invertido', frente: 'perro', verso: 'cachorro' });
  assert.equal(pergunta(inv, 'verso'), 'cachorro');
  assert.equal(resposta(inv, 'verso').texto, 'perro');
  const lac = flash('l', { tipo: 'lacuna', frente: 'Yo {{tuve}} un perro y {{fui}} feliz', verso: 'pretérito' });
  assert.equal(pergunta(lac, 'frente'), 'Yo [...] un perro y [...] feliz');
  assert.deepEqual(resposta(lac, 'frente'), { texto: 'Yo ==tuve== un perro y ==fui== feliz', observacao: 'pretérito' });
});

test('confereDigitado: exato, com acentos e maiúsculas; só as pontas são ignoradas', () => {
  const d = flash('d', { tipo: 'digitar', frente: 'cachorro', verso: '**Perro**' });
  assert.equal(confereDigitado('  Perro ', d).acertou, true);
  assert.equal(confereDigitado('perro', d).acertou, false);
  assert.equal(confereDigitado('Pérro', d).acertou, false);
  assert.deepEqual(confereDigitado('Pero', d).trechos, [{ texto: 'Per', igual: true }, { texto: '', igual: false }, { texto: 'o', igual: true }]);
  assert.equal(confereDigitado('Pero', d).certa, 'Perro');
});

test('validarFlashcard', () => {
  assert.equal(validarFlashcard({ tipo: 'basico', frente: ' ', verso: 'x' }), 'Escreva a frente.');
  assert.equal(validarFlashcard({ tipo: 'basico', frente: 'x', verso: '' }), 'Escreva o verso.');
  assert.equal(validarFlashcard({ tipo: 'digitar', frente: 'x', verso: '' }), 'Escreva a resposta exata.');
  assert.equal(validarFlashcard({ tipo: 'lacuna', frente: 'sem lacuna', verso: '' }), 'Marque pelo menos uma lacuna com {{ }}.');
  assert.equal(validarFlashcard({ tipo: 'lacuna', frente: 'a {{b c', verso: '' }), 'Há uma lacuna sem fechar ou vazia.');
  assert.equal(validarFlashcard({ tipo: 'lacuna', frente: 'a {{ }} c', verso: '' }), 'Há uma lacuna sem fechar ou vazia.');
  assert.equal(validarFlashcard({ tipo: 'lacuna', frente: 'a {{b}} c', verso: '' }), null);
  assert.equal(validarFlashcard({ tipo: 'basico', frente: 'x'.repeat(2001), verso: 'y' }), 'Use até 2000 letras em cada lado.');
});

test('aviso, série e acerto', () => {
  assert.equal(textoDoAvisoFlash(35), 'Você tem 35 flashcards para hoje.');
  assert.equal(textoDoAvisoFlash(1), 'Você tem 1 flashcard para hoje.');
  const dias = [{ data: '2026-11-17', revisados: 10, acertos: 8 }, { data: '2026-11-18', revisados: 10, acertos: 8 }, { data: '2026-11-30', revisados: 5, acertos: 0 }];
  const s = serieFlash(dias, '2026-11-16', '2026-11-22', 'dia');
  assert.equal(s.length, 7);
  assert.deepEqual(s[1], { inicio: '2026-11-17', revisados: 10, acertos: 8 });
  assert.equal(acertoDoPeriodo(dias, '2026-11-16', '2026-11-22'), 80);
  assert.equal(acertoDoPeriodo(dias, '2026-10-01', '2026-10-31'), null);
});


test('filaDoGrupo: junta os baralhos de dentro (cada um com seus limites), revisões antes dos novos', () => {
  const baralhos = [
    { id: 'G', nome: 'Idiomas', e_grupo: true, pai_id: null },
    { id: 'A', nome: 'Alemão', e_grupo: false, pai_id: 'G', novos_dia: 1, revisoes_dia: 200, fator: 2.5 },
    { id: 'B', nome: 'Basco', e_grupo: false, pai_id: 'G', novos_dia: 5, revisoes_dia: 200, fator: 2.5 },
    { id: 'C', nome: 'Fora', e_grupo: false, pai_id: null, novos_dia: 5, revisoes_dia: 200, fator: 2.5 },
  ];
  const flashcards = [flash('a1', { baralho_id: 'A' }), flash('a22', { baralho_id: 'A' }), flash('b1', { baralho_id: 'B' }),
    flash('b22', { baralho_id: 'B' }), flash('c1', { baralho_id: 'C' })];
  const lados = [lado('b22', { vence: HOJE, introduzido_em: '2026-11-01', intervalo: 3 })];
  const fila = filaDoGrupo({ baralhos, flashcards, flash_lados: lados, cards: [] }, 'G', HOJE, AJ);
  assert.deepEqual(fila.map((x) => x.flashcard.id), ['b22', 'a1', 'b1']);
});

test('confereDigitado: resposta com barra invertida é comparada como foi gravada', () => {
  assert.equal(confereDigitado('a\\.b', flash('d', { tipo: 'digitar', verso: 'a\\.b' })).acertou, true);
});

test('limitesDe: grupo com limites sobrepõe novos e revisões do baralho; o fator continua do baralho', () => {
  const baralhos = [
    { id: 'G', nome: 'G', e_grupo: true, pai_id: null, limites_do_grupo: true, novos_dia: 4, revisoes_dia: 40 },
    { id: 'B', nome: 'B', e_grupo: false, pai_id: 'G', novos_dia: 20, revisoes_dia: 200, fator: 3 },
  ];
  assert.deepEqual(limitesDe(flash('x'), { baralhos, ajustes: AJ }), { novos: 4, revisoes: 40, fator: 3 });
  baralhos[0].limites_do_grupo = false;
  assert.deepEqual(limitesDe(flash('x'), { baralhos, ajustes: AJ }), { novos: 20, revisoes: 200, fator: 3 });
});
