import test from 'node:test';
import assert from 'node:assert/strict';
import { proximaFase, duracaoS, restanteS, iniciarFase, pausar, retomar, textoDoFim, focoNoTique } from '../../js/regras/foco.js';

const AJ = { foco_min: 25, pausa_min: 5, pausa_longa_min: 15, ciclos_longa: 4, notif_silencio: false, notif_silencio_de: 1320, notif_silencio_ate: 420 };
const FUSO = 'America/Sao_Paulo';
const em = (hhmm) => Date.parse(`2026-11-24T${hhmm}:00-03:00`);
const iso = (hhmm) => new Date(em(hhmm)).toISOString();

test('proximaFase: pausa curta, e longa a cada 4 focos', () => {
  const seq = [];
  let f = { fase: 'foco', ciclo: 1 };
  for (let i = 0; i < 9; i += 1) { seq.push(`${f.fase}${f.ciclo}`); f = proximaFase(f, AJ); }
  assert.deepEqual(seq, ['foco1', 'pausa1', 'foco2', 'pausa2', 'foco3', 'pausa3', 'foco4', 'pausa_longa4', 'foco5']);
});

test('duracaoS', () => {
  assert.deepEqual(['foco', 'pausa', 'pausa_longa'].map((x) => duracaoS(x, AJ)), [1500, 300, 900]);
});

test('iniciarFase, restanteS, pausar e retomar', () => {
  const f = iniciarFase('foco', 1, em('10:00'), AJ);
  assert.deepEqual(f, { fase: 'foco', ciclo: 1, estado: 'rodando', termina_em: iso('10:25'), restante_s: null });
  assert.equal(restanteS(f, em('10:00') + 500), 1500);
  assert.equal(restanteS(f, em('10:24') + 1), 60);
  assert.equal(restanteS(f, em('11:00')), 0);
  const p = pausar({ ...f, termina_em: iso('10:20') }, em('10:00'));
  assert.deepEqual([p.estado, p.restante_s, p.termina_em], ['pausado', 1200, null]);
  assert.equal(restanteS(p, em('12:00')), 1200);
  const r = retomar(p, em('11:00'));
  assert.deepEqual([r.estado, r.termina_em, r.restante_s], ['rodando', iso('11:20'), null]);
  assert.equal(restanteS({ estado: 'esperando' }, em('11:00')), 0);
});

test('textoDoFim', () => {
  assert.deepEqual(textoDoFim({ fase: 'foco', ciclo: 2, titulo: 'Espanhol' }, AJ),
    { titulo: 'Espanhol', corpo: 'Foco concluído (ciclo 2 de 4). Hora da pausa de 5 min.', botao: 'Começar pausa' });
  assert.deepEqual(textoDoFim({ fase: 'foco', ciclo: 4, titulo: '' }, AJ),
    { titulo: 'Modo foco', corpo: 'Foco concluído (ciclo 4 de 4). Hora da pausa longa de 15 min.', botao: 'Começar pausa' });
  assert.deepEqual(textoDoFim({ fase: 'pausa', ciclo: 2, titulo: '' }, AJ),
    { titulo: 'Modo foco', corpo: 'Pausa terminada. Pronto para o foco 3?', botao: 'Começar foco' });
  assert.deepEqual(textoDoFim({ fase: 'pausa_longa', ciclo: 4, titulo: '' }, AJ),
    { titulo: 'Modo foco', corpo: 'Pausa longa terminada. Começar um novo ciclo?', botao: 'Começar foco' });
});

test('focoNoTique', () => {
  const f = { owner_id: 'u1', fase: 'foco', ciclo: 1, estado: 'rodando', termina_em: iso('10:25'), titulo: '' };
  const rodar = (hhmm, extra = {}) => focoNoTique({ foco: { ...f, ...extra.foco }, instanteMs: em(hhmm), fuso: FUSO, ajustes: { ...AJ, ...extra.ajustes }, enviadas: extra.enviadas || new Set() });
  const r = rodar('10:25');
  assert.equal(r.esperando, true);
  assert.equal(r.aviso.chave, `foco:u1:${iso('10:25')}`);
  assert.equal(r.aviso.botao, 'Começar pausa');
  assert.equal(rodar('10:26').aviso?.chave, `foco:u1:${iso('10:25')}`);
  assert.deepEqual(rodar('10:28'), { aviso: null, esperando: true });
  assert.deepEqual(rodar('10:24'), { aviso: null, esperando: false });
  assert.deepEqual(rodar('10:25', { enviadas: new Set([`foco:u1:${iso('10:25')}`]) }), { aviso: null, esperando: true });
  assert.deepEqual(rodar('10:25', { ajustes: { notif_silencio: true, notif_silencio_de: 600, notif_silencio_ate: 700 } }), { aviso: null, esperando: true });
  assert.deepEqual(rodar('10:25', { foco: { estado: 'pausado', termina_em: null, restante_s: 60 } }), { aviso: null, esperando: false });
  assert.deepEqual(rodar('10:25', { foco: { estado: 'esperando' } }), { aviso: null, esperando: false });
});
