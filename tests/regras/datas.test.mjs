import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoDe, somaDias, diaDaSemana, inicioDaSemana, diasDaSemana, horaTexto, minutosDe,
} from '../../js/regras/datas.js';

test('isoDe: 23h30 local não vira o dia seguinte', () => {
  assert.equal(isoDe(new Date(2026, 10, 16, 23, 30)), '2026-11-16');
});

test('diaDaSemana: segunda é 1', () => {
  assert.equal(diaDaSemana('2026-11-16'), 1);
});

test('diaDaSemana: domingo é 7', () => {
  assert.equal(diaDaSemana('2026-11-22'), 7);
});

test('inicioDaSemana: domingo volta para a segunda', () => {
  assert.equal(inicioDaSemana('2026-11-22'), '2026-11-16');
});

test('inicioDaSemana: segunda fica na própria segunda', () => {
  assert.equal(inicioDaSemana('2026-11-16'), '2026-11-16');
});

test('somaDias: vira o ano', () => {
  assert.equal(somaDias('2026-12-29', 5), '2027-01-03');
});

test('inicioDaSemana: atravessa a virada do ano', () => {
  assert.equal(inicioDaSemana('2027-01-01'), '2026-12-28');
});

test('diasDaSemana: começa na segunda', () => {
  assert.deepEqual(diasDaSemana('2026-11-18').slice(0, 2), ['2026-11-16', '2026-11-17']);
});

test('horaTexto: 390 vira 06:30', () => {
  assert.equal(horaTexto(390), '06:30');
});

test('minutosDe: 22:00 vira 1320', () => {
  assert.equal(minutosDe('22:00'), 1320);
});

test('rótulos da semana e do dia', async () => {
  const { rotuloSemana, rotuloDia, diasDaSemana } = await import('../../js/regras/datas.js');
  assert.equal(rotuloSemana(diasDaSemana('2026-11-18')), '16 a 22 de novembro');
  assert.equal(rotuloSemana(diasDaSemana('2026-12-02')), '30 de novembro a 6 de dezembro');
  assert.equal(rotuloDia('2026-11-16'), 'segunda-feira, 16 de novembro');
  assert.equal(rotuloDia('2026-11-15'), 'domingo, 15 de novembro');
});
