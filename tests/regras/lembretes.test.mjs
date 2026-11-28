import test from 'node:test';
import assert from 'node:assert/strict';
import { agoraNoFuso, emSilencio, devidos, refDoBloco, flashVence } from '../../js/regras/lembretes.js';

const FUSO = 'America/Sao_Paulo';
// 2026-11-23 é segunda; São Paulo = UTC-3 (sem horário de verão).
const em = (hhmm, dia = '2026-11-23') => Date.parse(`${dia}T${hhmm}:00-03:00`);
const PADRAO = { notif_antes_min: 10, notif_resumo: true, notif_resumo_min: 420, notif_pendencias: true, notif_pendencias_min: 1290,
  notif_silencio: false, notif_silencio_de: 1320, notif_silencio_ate: 420 };
const bloco = (x = {}) => ({ id: 'b1', date: '2026-11-23', start_min: 1290, end_min: 1380, title: 'Vocabulário', status: 'planned', lembrete_min: null, ...x });
const rodar = (hhmm, blocos, extra = {}) => devidos({ instanteMs: em(hhmm, extra.dia), fuso: FUSO, ajustes: { ...PADRAO, ...extra.ajustes }, blocos, adiamentos: extra.adiamentos || [], enviadas: extra.enviadas || new Set() });
const antes = (r) => r.filter((n) => n.tipo === 'antes');

test('agoraNoFuso: data e minuto locais', () => {
  assert.deepEqual(agoraNoFuso(em('21:20'), FUSO), { data: '2026-11-23', minuto: 1280 });
  assert.deepEqual(agoraNoFuso(Date.parse('2026-11-24T02:30:00Z'), FUSO), { data: '2026-11-23', minuto: 1410 });
});

test('lembrete padrão de 10 min sai às 21:20 para bloco das 21:30', () => {
  const [n] = antes(rodar('21:20', [bloco()]));
  assert.deepEqual([n.chave, n.titulo, n.corpo, n.ref, n.data], ['antes:b1:2026-11-23:1290', 'Vocabulário', 'Começa às 21:30 (em 10 min)', 'b1', '2026-11-23']);
  assert.deepEqual(n.acoes, ['cumprir', 'adiar']);
});

test('tolerância de 5 min (o agendador pode atrasar): 21:24 ainda envia, 21:25 não', () => {
  assert.equal(antes(rodar('21:24', [bloco()])).length, 1);
  assert.equal(antes(rodar('21:25', [bloco()])).length, 0);
  assert.equal(antes(rodar('21:19', [bloco()])).length, 0);
});

test('lembrete que sai atrasado diz quanto falta de verdade', () => {
  assert.equal(antes(rodar('21:23', [bloco()]))[0].corpo, 'Começa às 21:30 (em 7 min)');
  assert.equal(antes(rodar('21:32', [bloco({ lembrete_min: 0 })]))[0].corpo, 'Começou às 21:30');
});

test('lembrete do bloco vence o padrão: nenhum e na hora', () => {
  assert.equal(antes(rodar('21:20', [bloco({ lembrete_min: -1 })])).length, 0);
  const [n] = antes(rodar('21:30', [bloco({ lembrete_min: 0 })]));
  assert.equal(n.corpo, 'Começa agora');
});

test('padrão "nenhum" e bloco sem lembrete próprio: não envia', () => {
  assert.equal(antes(rodar('21:20', [bloco()], { ajustes: { notif_antes_min: -1 } })).length, 0);
});

test('ocorrência virtual usa a ref da fixa e o lembrete dela', () => {
  const v = bloco({ id: undefined, virtual: true, commitment_id: 'f1', lembrete_min: 30 });
  assert.equal(refDoBloco(v), 'v:f1');
  const [n] = antes(rodar('21:00', [v]));
  assert.equal(n.chave, 'antes:v:f1:2026-11-23:1290');
});

test('bloco cumprido ou não feito não recebe lembrete', () => {
  assert.equal(antes(rodar('21:20', [bloco({ status: 'done' })])).length, 0);
  assert.equal(antes(rodar('21:20', [bloco({ status: 'missed' })])).length, 0);
});

test('o que já foi enviado não volta', () => {
  assert.equal(antes(rodar('21:20', [bloco()], { enviadas: new Set(['antes:b1:2026-11-23:1290']) })).length, 0);
});

test('bloco de amanhã às 00:10 com lembrete de 60 min vence às 23:10 de hoje', () => {
  const b = bloco({ id: 'b2', date: '2026-11-24', start_min: 10, end_min: 60, lembrete_min: 60 });
  const [n] = antes(rodar('23:10', [b]));
  assert.deepEqual([n.chave, n.corpo, n.data], ['antes:b2:2026-11-24:10', 'Começa às 00:10 (em 60 min)', '2026-11-24']);
});

test('emSilencio: 22:00–07:00 inclui 22:00 e 06:59, não inclui 07:00; desligado nunca', () => {
  const a = { ...PADRAO, notif_silencio: true };
  assert.equal(emSilencio(1320, a), true);
  assert.equal(emSilencio(419, a), true);
  assert.equal(emSilencio(420, a), false);
  assert.equal(emSilencio(1319, a), false);
  assert.equal(emSilencio(1380, PADRAO), false);
  assert.equal(emSilencio(780, { ...a, notif_silencio_de: 720, notif_silencio_ate: 840 }), true);
});

test('silêncio descarta o lembrete das 23:00 e deixa sair o resumo das 07:00', () => {
  const ajustes = { notif_silencio: true };
  assert.equal(rodar('23:00', [bloco({ start_min: 1390, end_min: 1430 })], { ajustes }).length, 0);
  const r = rodar('07:00', [bloco({ start_min: 600, end_min: 660 })], { ajustes });
  assert.deepEqual(r.map((n) => n.tipo), ['resumo']);
});

test('resumo: até 4 itens em ordem e "e mais N"; sem blocos não envia', () => {
  const seis = [6, 1, 2, 3, 4, 5].map((h) => bloco({ id: `x${h}`, start_min: 480 + h * 60, end_min: 500 + h * 60, title: `T${h}` }));
  const [n] = rodar('07:00', seis).filter((x) => x.tipo === 'resumo');
  assert.deepEqual([n.chave, n.titulo], ['resumo:2026-11-23', 'Hoje']);
  assert.equal(n.corpo, '09:00 T1 · 10:00 T2 · 11:00 T3 · 12:00 T4 e mais 2');
  assert.equal(rodar('07:00', []).filter((x) => x.tipo === 'resumo').length, 0);
  assert.equal(rodar('07:00', seis, { ajustes: { notif_resumo: false } }).filter((x) => x.tipo === 'resumo').length, 0);
});

test('resumo ignora blocos de amanhã', () => {
  const r = rodar('07:00', [bloco({ date: '2026-11-24', start_min: 600 })]).filter((x) => x.tipo === 'resumo');
  assert.equal(r.length, 0);
});

test('pendências: só blocos de hoje já terminados e planejados; singular e plural', () => {
  const blocos = [bloco({ id: 'p1', start_min: 600, end_min: 660, title: 'Inglês' }), bloco({ id: 'p2', start_min: 700, end_min: 760, title: 'Leitura', status: 'done' }),
    bloco({ id: 'p3', start_min: 1300, end_min: 1400, title: 'Depois' })];
  const [n] = rodar('21:30', blocos).filter((x) => x.tipo === 'pendencias');
  assert.deepEqual([n.chave, n.titulo, n.corpo], ['pendencias:2026-11-23', 'Faltou marcar', '1 bloco de hoje sem marcar: Inglês']);
  const dois = [...blocos, bloco({ id: 'p4', start_min: 800, end_min: 860, title: 'Exatas' })];
  assert.equal(rodar('21:30', dois).find((x) => x.tipo === 'pendencias').corpo, '2 blocos de hoje sem marcar: Inglês, Exatas');
  assert.equal(rodar('21:30', [blocos[1]]).filter((x) => x.tipo === 'pendencias').length, 0);
});

test('adiado vence no horário e respeita o estado do bloco', () => {
  const adiamentos = [{ id: 'a1', ref: 'b1', data: '2026-11-23', quando: new Date(em('21:30')).toISOString() }];
  const [n] = rodar('21:30', [bloco()], { adiamentos }).filter((x) => x.tipo === 'adiado');
  assert.equal(n.chave, `adiado:b1:2026-11-23:${adiamentos[0].quando}`);
  assert.equal(n.corpo, 'Começa às 21:30 (lembrete adiado)');
  assert.equal(rodar('21:30', [bloco({ status: 'done' })], { adiamentos }).filter((x) => x.tipo === 'adiado').length, 0);
  assert.equal(rodar('21:28', [bloco()], { adiamentos }).filter((x) => x.tipo === 'adiado').length, 0);
});

// ---- Revisão da semana (domingo 22/11 às 20:00 por padrão)
// ---- Aviso dos flashcards do dia (19:00 por padrão)
const FL = { ...PADRAO, flash_aviso: true, flash_aviso_min: 1140 };
const fl = (hhmm, ajustes = {}, enviadas = new Set()) => flashVence({ instanteMs: em(hhmm, '2026-11-24'), fuso: FUSO, ajustes: { ...FL, ...ajustes }, enviadas });

test('flashVence: 19:00 a 19:04; nada desligado, enviado, em silêncio ou fora da hora', () => {
  assert.deepEqual(fl('19:00'), { chave: 'flash:2026-11-24', data: '2026-11-24' });
  assert.ok(fl('19:01'));
  assert.ok(fl('19:04'));
  assert.equal(fl('19:05'), null);
  assert.equal(fl('19:00', { flash_aviso: false }), null);
  assert.equal(fl('19:00', {}, new Set(['flash:2026-11-24'])), null);
  assert.equal(fl('19:00', { notif_silencio: true, notif_silencio_de: 1080, notif_silencio_ate: 420 }), null);
});
