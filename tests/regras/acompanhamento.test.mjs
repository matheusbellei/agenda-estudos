import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tagsDeEstudo, blocosDeEstudo, situacao, resumo, sequencia, periodo, deslocar, graoDoIntervalo, serie,
  mapaNaoFeito, piorHorario, classeDaCelula, horasPorTag, corDaMeta, horasDoCard,
  formatarHoras, semanasDoPeriodo, sequenciaDosDados, horasDosCards, intervaloValido,
} from '../../js/regras/acompanhamento.js';

const HOJE = '2026-11-18'; // quarta
const AGORA = { data: HOJE, minuto: 600 };
const b = (extra) => ({ id: Math.random().toString(36).slice(2), date: HOJE, start_min: 480, end_min: 540,
  status: 'planned', cancelled: false, category_id: 'E', ...extra });
const cat = (id, extra = {}) => ({ id, name: id, color: '#6F4E37', parent_id: null, conta_estudo: false, meta_semanal_min: null, archived: false, ...extra });

test('tagsDeEstudo: mãe marcada leva as filhas; filha marcada sozinha conta', () => {
  const s = tagsDeEstudo([cat('M', { conta_estudo: true }), cat('F', { parent_id: 'M' }), cat('N'), cat('G', { parent_id: 'N', conta_estudo: true })]);
  assert.deepEqual([...s].sort(), ['F', 'G', 'M']);
});

test('blocosDeEstudo: tira cancelado, sem tag e tag fora do conjunto', () => {
  const lista = [b({ id: 'ok' }), b({ id: 'c', cancelled: true }), b({ id: 's', category_id: null }), b({ id: 'f', category_id: 'X' })];
  assert.deepEqual(blocosDeEstudo(lista, new Set(['E'])).map((x) => x.id), ['ok']);
});

test('situacao', () => {
  assert.equal(situacao(b({ status: 'done' }), AGORA), 'cumprido');
  assert.equal(situacao(b({ status: 'missed' }), AGORA), 'nao_feito');
  assert.equal(situacao(b({ date: '2026-11-17', start_min: 1200, end_min: 1260 }), AGORA), 'sem_marcar');
  assert.equal(situacao(b({ start_min: 480, end_min: 540 }), AGORA), 'sem_marcar');
  assert.equal(situacao(b({ start_min: 600, end_min: 660 }), AGORA), 'futuro');
});

test('resumo', () => {
  const r = resumo([
    b({ start_min: 0, end_min: 60, status: 'done' }),
    b({ start_min: 60, end_min: 150, status: 'missed' }),
    b({ start_min: 150, end_min: 180 }),
    b({ start_min: 700, end_min: 820 }),
  ], AGORA);
  assert.deepEqual(r, { planejado_min: 300, cumprido_min: 60, cumpridos: 1, nao_feitos: 2, nao_feito_min: 120, pct: 33 });
  assert.equal(resumo([], AGORA).pct, null);
});

test('sequencia: dias até hoje com o mínimo; hoje abaixo não quebra; não depende do período da tela', () => {
  const dia = (date, min) => b({ date, start_min: 0, end_min: min, status: 'done' });
  const base = [dia('2026-11-15', 30), dia('2026-11-16', 30), dia('2026-11-17', 30)];
  assert.equal(sequencia(base, AGORA, 30), 3);
  assert.equal(sequencia([...base, dia(HOJE, 30)], AGORA, 30), 4);
  assert.equal(sequencia([dia('2026-11-15', 30), dia('2026-11-16', 29), dia('2026-11-17', 30)], AGORA, 30), 1);
  const longa = [];
  for (let d = 1; d <= 31; d += 1) longa.push(dia(`2026-10-${String(d).padStart(2, '0')}`, 40));
  for (let d = 1; d <= 17; d += 1) longa.push(dia(`2026-11-${String(d).padStart(2, '0')}`, 40));
  assert.equal(sequencia(longa, AGORA, 30), 48);
  assert.equal(sequencia([], AGORA, 30), 0);
});

test('periodo e deslocar', () => {
  assert.deepEqual(periodo('semana', HOJE), { de: '2026-11-16', ate: '2026-11-22', rotulo: '16 a 22 de novembro' });
  assert.equal(periodo('semana', '2026-12-30').rotulo, '28 de dezembro a 3 de janeiro');
  assert.deepEqual(periodo('mes', HOJE), { de: '2026-11-01', ate: '2026-11-30', rotulo: 'novembro de 2026' });
  assert.deepEqual(periodo('ano', HOJE), { de: '2026-01-01', ate: '2026-12-31', rotulo: '2026' });
  assert.deepEqual(periodo('intervalo', HOJE, { de: '2026-10-01', ate: '2026-11-15' }), { de: '2026-10-01', ate: '2026-11-15', rotulo: '1 de outubro a 15 de novembro' });
  assert.equal(periodo('intervalo', HOJE, { de: '2026-11-16', ate: '2026-11-17' }).rotulo, '16 a 17 de novembro');
  assert.equal(deslocar('mes', '2026-01-31', 1), '2026-02-01');
  assert.equal(deslocar('semana', HOJE, -1), '2026-11-09');
  assert.equal(deslocar('ano', HOJE, 1), '2027-01-01');
});

test('graoDoIntervalo', () => {
  assert.equal(graoDoIntervalo('2026-01-01', '2026-01-31'), 'dia');
  assert.equal(graoDoIntervalo('2026-01-01', '2026-02-01'), 'semana');
  assert.equal(graoDoIntervalo('2026-01-01', '2026-07-01'), 'semana'); // 182 dias
  assert.equal(graoDoIntervalo('2026-01-01', '2026-07-02'), 'mes');
});

test('serie: barras por dia, semana (partida) e mês', () => {
  const blocos = [b({ date: '2026-11-17', status: 'done' }), b({ date: '2026-11-17' }), b({ date: '2026-11-01', status: 'done' })];
  const s = serie(blocos, '2026-11-16', '2026-11-22', 'dia');
  assert.equal(s.length, 7);
  assert.deepEqual(s[1], { inicio: '2026-11-17', planejado_min: 120, cumprido_min: 60 });
  const m = serie(blocos, '2026-11-01', '2026-11-30', 'semana');
  assert.deepEqual(m.map((x) => x.inicio), ['2026-11-01', '2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.equal(m[0].cumprido_min, 60);
  assert.equal(m[3].planejado_min, 120);
  assert.equal(serie(blocos, '2026-01-01', '2026-12-31', 'mes').length, 12);
});

test('mapaNaoFeito, piorHorario e classeDaCelula', () => {
  const quartaNoite = b({ date: '2026-11-11', start_min: 1140, end_min: 1200, status: 'missed' });
  const futuro = b({ date: '2026-11-19', start_min: 1140, end_min: 1200 });
  const c = mapaNaoFeito([quartaNoite, futuro], AGORA);
  assert.deepEqual(c[2][2], { terminados: 1, nao_feitos: 1 });
  assert.deepEqual(c[3][2], { terminados: 0, nao_feitos: 0 });
  assert.equal(piorHorario(c), 'Mais falhas: quarta à noite');
  const sexta = b({ date: '2026-11-13', start_min: 1140, end_min: 1200, status: 'missed' });
  assert.equal(piorHorario(mapaNaoFeito([quartaNoite, sexta], AGORA)), 'Mais falhas: quarta à noite e sexta à noite');
  assert.equal(piorHorario(mapaNaoFeito([b({ date: '2026-11-11', status: 'done' })], AGORA)), null);
  assert.equal(classeDaCelula({ terminados: 0, nao_feitos: 0 }), 'vazio');
  assert.equal(classeDaCelula({ terminados: 4, nao_feitos: 0 }), '0');
  assert.equal(classeDaCelula({ terminados: 4, nao_feitos: 1 }), '1');
  assert.equal(classeDaCelula({ terminados: 4, nao_feitos: 2 }), '2');
  assert.equal(classeDaCelula({ terminados: 4, nao_feitos: 3 }), '3');
});

test('horasPorTag: mãe soma filhas, média por semana, arquivada com horas aparece', () => {
  const cats = [cat('I', { name: 'Idiomas', conta_estudo: true, meta_semanal_min: 600 }), cat('ES', { name: 'Espanhol', parent_id: 'I' }),
    cat('IN', { name: 'Inglês', parent_id: 'I' }), cat('A', { name: 'Antiga', conta_estudo: true, archived: true }), cat('V', { name: 'Vazia', conta_estudo: true })];
  const blocos = [b({ category_id: 'ES', start_min: 0, end_min: 120, status: 'done' }), b({ category_id: 'IN', start_min: 0, end_min: 30, status: 'done' }),
    b({ category_id: 'I', start_min: 0, end_min: 60, status: 'done' }), b({ category_id: 'A', start_min: 0, end_min: 15, status: 'done' }),
    b({ category_id: 'I', start_min: 700, end_min: 760 })];
  const t = horasPorTag(cats, blocos, 4);
  assert.deepEqual(t.map((x) => x.nome), ['Idiomas', 'Antiga']);
  assert.equal(t[0].cumprido_min, 210);
  assert.equal(t[0].media_min, 53);
  assert.equal(t[0].meta_min, 600);
  assert.deepEqual(t[0].filhas.map((x) => [x.nome, x.cumprido_min]), [['Espanhol', 120], ['Inglês', 30]]);
  assert.equal(horasPorTag(cats, blocos, 1)[0].media_min, 210);
});

test('corDaMeta', () => {
  assert.equal(corDaMeta(600, 600), 'ok');
  assert.equal(corDaMeta(300, 600), 'meio');
  assert.equal(corDaMeta(299, 600), 'baixo');
});

test('horasDoCard: gravados sem cancelados + fixa sem fim só até o domingo desta semana', () => {
  const blocks = [b({ card_id: 'K', status: 'done', start_min: 0, end_min: 60 }), b({ card_id: 'K', cancelled: true }),
    b({ card_id: 'K', date: '2026-11-25', start_min: 0, end_min: 30 }), b({ card_id: 'Z' })];
  const commitments = [{ id: 'F', title: 'f', days: [1], start_min: 600, end_min: 660, valid_from: '2026-11-09', valid_to: null, card_id: 'K', category_id: null }];
  assert.deepEqual(horasDoCard('K', { commitments, blocks }, HOJE), { planejado_min: 60 + 30 + 60 * 2, cumprido_min: 60 });
});

test('formatarHoras', () => {
  assert.deepEqual([0, 45, 60, 570, 605].map(formatarHoras), ['0 min', '45 min', '1h', '9h30', '10h05']);
});

test('semanasDoPeriodo: média só sobre os dias já vividos', () => {
  assert.equal(semanasDoPeriodo('2026-01-01', '2026-12-31', '2026-01-14'), 2);
  assert.equal(semanasDoPeriodo('2026-11-01', '2026-11-30', HOJE), 18 / 7);
  assert.equal(semanasDoPeriodo('2026-10-01', '2026-10-31', HOJE), 31 / 7);
  assert.equal(semanasDoPeriodo('2027-01-01', '2027-12-31', HOJE), 1);
  assert.equal(semanasDoPeriodo('2026-11-16', '2026-11-18', HOJE), 1);
});

test('sequenciaDosDados: conta além de um ano quando a sequência é longa', () => {
  const blocks = [];
  for (let i = 1; i <= 400; i += 1) {
    const d = new Date(Date.UTC(2026, 10, 18 - i));
    blocks.push(b({ date: d.toISOString().slice(0, 10), start_min: 0, end_min: 40, status: 'done' }));
  }
  const dados = { categories: [cat('E', { conta_estudo: true })], commitments: [], blocks };
  assert.equal(sequenciaDosDados(dados, AGORA, 30), 400);
  assert.equal(sequenciaDosDados({ ...dados, blocks: blocks.slice(0, 5) }, AGORA, 30), 5);
});

test('horasDosCards: o mesmo que horasDoCard, de uma vez', () => {
  const blocks = [b({ card_id: 'K', status: 'done', start_min: 0, end_min: 60 }), b({ card_id: 'Z', start_min: 0, end_min: 30 }), b({ card_id: 'K', cancelled: true })];
  const commitments = [{ id: 'F', title: 'f', days: [1], start_min: 600, end_min: 660, valid_from: '2026-11-09', valid_to: null, card_id: 'K', category_id: null }];
  const m = horasDosCards(['K', 'Z', 'Y'], { commitments, blocks }, HOJE);
  for (const id of ['K', 'Z', 'Y']) assert.deepEqual(m.get(id), horasDoCard(id, { commitments, blocks }, HOJE));
});

test('intervaloValido: fim antes do início e mais de 5 anos', () => {
  assert.equal(intervaloValido('2026-11-20', '2026-11-10'), 'A data final vem antes da inicial.');
  assert.equal(intervaloValido('2020-01-01', '2026-11-18'), 'Escolha um intervalo de até 5 anos.');
  assert.equal(intervaloValido('2021-11-19', '2026-11-18'), null);
  assert.equal(intervaloValido('2026-11-18', '2026-11-18'), null);
});
