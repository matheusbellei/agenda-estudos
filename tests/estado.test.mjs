import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEstado, TABELAS } from '../js/estado.js';

// Store falso em memória, só com o que o estado usa.
function storeFalso(inicial = {}) {
  const db = Object.fromEntries(TABELAS.map((t) => [t, [...(inicial[t] || [])]]));
  let seq = 0;
  const falhas = new Set();
  const f = (op) => { if (falhas.has(op)) throw new Error('Sem conexão. Tente de novo.'); };
  return {
    db, falhas,
    async list(t) { f('list'); return [...db[t]]; },
    async insert(t, linhas) {
      f('insert');
      const novas = (Array.isArray(linhas) ? linhas : [linhas]).map((l) => (t === 'settings' ? { owner_id: 'u1', ...l } : { id: 'n' + (++seq), ...l }));
      db[t].push(...novas);
      return novas;
    },
    async update(t, id, patch) {
      f('update');
      const k = t === 'settings' ? 'owner_id' : 'id';
      const i = db[t].findIndex((l) => l[k] === id);
      db[t][i] = { ...db[t][i], ...patch };
      return db[t][i];
    },
    async remove(t, id) { f('remove'); db[t] = db[t].filter((l) => l.id !== id); },
    async removeIds(t, ids) { f('removeIds'); db[t] = db[t].filter((l) => !ids.includes(l.id)); },
    async removeWhere(t, filtro) { f('removeWhere'); db[t] = db[t].filter((l) => !Object.keys(filtro).every((k) => l[k] === filtro[k])); },
  };
}

test('carregar preenche as 16 chaves de dados', async () => {
  const e = criarEstado(storeFalso({ cards: [{ id: 'c1' }], categories: [{ id: 'k1' }] }));
  assert.deepEqual(Object.keys(e.dados), TABELAS);
  await e.carregar();
  assert.equal(e.dados.cards.length, 1);
  assert.equal(e.dados.categories.length, 1);
  assert.equal(TABELAS.length, 16);
});

test('criar acrescenta em dados e avisa o ouvinte uma vez', async () => {
  const e = criarEstado(storeFalso());
  let avisos = 0;
  e.aoMudar(() => avisos++);
  const c = await e.criar('cards', { title: 'A' });
  assert.equal(e.dados.cards.length, 1);
  assert.equal(e.dados.cards[0].title, 'A');
  assert.equal(c.id, e.dados.cards[0].id);
  assert.equal(avisos, 1);
});

test('alterar troca a linha em dados e avisa', async () => {
  const e = criarEstado(storeFalso({ cards: [{ id: 'c1', title: 'A' }] }));
  await e.carregar();
  let avisos = 0;
  e.aoMudar(() => avisos++);
  await e.alterar('cards', 'c1', { title: 'B' });
  assert.equal(e.dados.cards[0].title, 'B');
  assert.equal(avisos, 1);
});

test('falha do store: o erro sobe, dados não mudam e ninguém é avisado', async () => {
  const store = storeFalso({ cards: [{ id: 'c1', title: 'A' }] });
  const e = criarEstado(store);
  await e.carregar();
  let avisos = 0;
  e.aoMudar(() => avisos++);
  store.falhas.add('update'); store.falhas.add('insert'); store.falhas.add('remove');
  await assert.rejects(e.alterar('cards', 'c1', { title: 'B' }), /Sem conexão/);
  await assert.rejects(e.criar('cards', { title: 'C' }), /Sem conexão/);
  await assert.rejects(e.excluir('cards', 'c1'), /Sem conexão/);
  assert.deepEqual(e.dados.cards, [{ id: 'c1', title: 'A' }]);
  assert.equal(avisos, 0);
});

test('ajustes: padrões sem linha; alterar settings cria a linha e depois atualiza', async () => {
  const store = storeFalso();
  const e = criarEstado(store);
  await e.carregar();
  assert.deepEqual(e.ajustes(), { day_start_min: 0, day_end_min: 1440, week_slot_min: 120, day_slot_min: 30, last_rollover: null, auto_card: 'perguntar', auto_card_list_id: null,
    notif_antes_min: 10, notif_resumo: true, notif_resumo_min: 420, notif_pendencias: true, notif_pendencias_min: 1290,
    notif_silencio: false, notif_silencio_de: 1320, notif_silencio_ate: 420, fuso: 'America/Sao_Paulo',
    sequencia_min: 30, revisao: true, revisao_dia: 7, revisao_min: 1200,
    foco_min: 25, pausa_min: 5, pausa_longa_min: 15, ciclos_longa: 4, foco_som: true,
    revisoes_dias: [7, 30], modelos_com_fixas: false,
    flash_card_novos_dia: 20, flash_card_revisoes_dia: 200, flash_card_fator: 2.5, flash_aviso: true, flash_aviso_min: 1140 });
  await e.alterar('settings', null, { day_start_min: 480 });
  assert.equal(e.ajustes().day_start_min, 480);
  assert.equal(e.ajustes().day_end_min, 1440);
  assert.equal(e.dados.settings.length, 1);
  await e.alterar('settings', null, { last_rollover: '2026-11-16' });
  assert.equal(e.dados.settings.length, 1);
  assert.equal(store.db.settings.length, 1);
  assert.equal(e.ajustes().last_rollover, '2026-11-16');
  assert.equal(e.ajustes().day_start_min, 480);
});

test('excluir card limpa filhos e zera card_id/item_id nos blocos', async () => {
  const e = criarEstado(storeFalso({
    cards: [{ id: 'c1' }, { id: 'c2' }],
    items: [{ id: 'i1', card_id: 'c1' }, { id: 'i2', card_id: 'c2' }],
    attachments: [{ id: 'a1', card_id: 'c1' }, { id: 'a2', card_id: 'c2' }],
    occurrences: [{ id: 'o1', card_id: 'c1' }, { id: 'o2', card_id: 'c2' }],
    card_categories: [{ card_id: 'c1', category_id: 'k' }, { card_id: 'c2', category_id: 'k' }],
    blocks: [{ id: 'b1', card_id: 'c1', item_id: 'i1' }, { id: 'b2', card_id: 'c2', item_id: 'i2' }],
  }));
  await e.carregar();
  await e.excluir('cards', 'c1');
  const d = e.dados;
  assert.deepEqual(d.cards.map((x) => x.id), ['c2']);
  assert.deepEqual(d.items.map((x) => x.id), ['i2']);
  assert.deepEqual(d.attachments.map((x) => x.id), ['a2']);
  assert.deepEqual(d.occurrences.map((x) => x.id), ['o2']);
  assert.deepEqual(d.card_categories, [{ card_id: 'c2', category_id: 'k' }]);
  assert.deepEqual(d.blocks, [{ id: 'b1', card_id: null, item_id: null }, { id: 'b2', card_id: 'c2', item_id: 'i2' }]);
});

test('definirCategorias inclui e remove só o que mudou', async () => {
  const store = storeFalso({ card_categories: [{ card_id: 'c1', category_id: 'a' }, { card_id: 'c1', category_id: 'b' }, { card_id: 'c2', category_id: 'a' }] });
  const e = criarEstado(store);
  await e.carregar();
  let avisos = 0;
  e.aoMudar(() => avisos++);
  await e.definirCategorias('c1', ['b', 'c']);
  const de = (id) => e.dados.card_categories.filter((x) => x.card_id === id).map((x) => x.category_id).sort();
  assert.deepEqual(de('c1'), ['b', 'c']);
  assert.deepEqual(de('c2'), ['a']);
  assert.deepEqual(store.db.card_categories.filter((x) => x.card_id === 'c1').map((x) => x.category_id).sort(), ['b', 'c']);
  assert.equal(avisos, 1);
  await e.definirCategorias('c1', ['c', 'b']);
  assert.equal(avisos, 1);
});

test('definirCategorias: se incluir falhar, as antigas ficam (inclui antes de remover)', async () => {
  const store = storeFalso({ card_categories: [{ card_id: 'c1', category_id: 'a' }] });
  store.insert = async () => { throw new Error('Sem conexão'); };
  const e = criarEstado(store);
  await e.carregar();
  await assert.rejects(e.definirCategorias('c1', ['b']));
  assert.deepEqual(store.db.card_categories.filter((x) => x.card_id === 'c1').map((x) => x.category_id), ['a']);
  assert.deepEqual(e.dados.card_categories.map((x) => x.category_id), ['a']);
});

test('excluir item limpa os anexos dele e zera item_id nos blocos', async () => {
  const e = criarEstado(storeFalso({
    cards: [{ id: 'c1' }],
    items: [{ id: 'i1', card_id: 'c1' }, { id: 'i2', card_id: 'c1' }],
    attachments: [{ id: 'a1', card_id: 'c1', item_id: 'i1' }, { id: 'a2', card_id: 'c1', item_id: 'i2' }, { id: 'a3', card_id: 'c1', item_id: null }],
    blocks: [{ id: 'b1', card_id: 'c1', item_id: 'i1' }, { id: 'b2', card_id: 'c1', item_id: 'i2' }],
  }));
  await e.carregar();
  await e.excluir('items', 'i1');
  const d = e.dados;
  assert.deepEqual(d.items.map((x) => x.id), ['i2']);
  assert.deepEqual(d.attachments.map((x) => x.id), ['a2', 'a3']);
  assert.deepEqual(d.blocks, [{ id: 'b1', card_id: 'c1', item_id: null }, { id: 'b2', card_id: 'c1', item_id: 'i2' }]);
});

test('excluir compromisso apaga da memória os blocos dele (cascata do banco)', async () => {
  const e = criarEstado(storeFalso({
    commitments: [{ id: 'c1' }, { id: 'c2' }],
    blocks: [{ id: 'b1', commitment_id: 'c1' }, { id: 'b2', commitment_id: 'c2' }, { id: 'b3', commitment_id: null }],
  }));
  await e.carregar();
  let avisos = 0;
  e.aoMudar(() => { avisos++; });
  await e.excluir('commitments', 'c1');
  assert.deepEqual(e.dados.commitments.map((c) => c.id), ['c2']);
  assert.deepEqual(e.dados.blocks.map((b) => b.id), ['b2', 'b3']);
  assert.equal(avisos, 1);
});

// Store cuja leitura tira a foto na hora e só responde quando `soltar()` é chamado.
function storeLento(inicial) {
  const s = storeFalso(inicial);
  const esperas = [];
  const list = s.list;
  s.lento = false;
  s.list = async (t) => {
    const foto = await list(t);
    if (s.lento) await new Promise((r) => esperas.push(r));
    return foto;
  };
  s.soltar = () => esperas.splice(0).forEach((r) => r());
  return s;
}
const pausa = () => new Promise((r) => setTimeout(r, 0));

test('recarregar descarta a foto se houve gravação durante a leitura', async () => {
  const store = storeLento({ cards: [{ id: 'c1', title: 'Curso de Python', notes: 'base' }] });
  const estado = criarEstado(store);
  await estado.carregar();
  store.lento = true;
  const recarga = estado.recarregar();
  await pausa();
  await estado.alterar('cards', 'c1', { notes: 'texto salvo' });
  await estado.criar('cards', { title: 'Card criado logo depois' });
  store.lento = false;
  store.soltar();
  await recarga;
  assert.deepEqual(estado.dados.cards.map((c) => c.notes ?? c.title), ['texto salvo', 'Card criado logo depois']);
});

test('recarregar descarta a foto se uma gravação já estava em curso quando a leitura começou', async () => {
  const store = storeLento({ cards: [{ id: 'c1', title: 'x', notes: 'base' }] });
  let soltarUpdate;
  const update = store.update;
  store.update = async (...a) => { await new Promise((r) => { soltarUpdate = r; }); return update(...a); };
  const estado = criarEstado(store);
  await estado.carregar();
  const gravando = estado.alterar('cards', 'c1', { notes: 'novo' });
  await pausa();
  store.lento = true;
  const recarga = estado.recarregar();
  await pausa();
  soltarUpdate(); await gravando;
  store.lento = false;
  store.soltar();
  await recarga;
  assert.equal(estado.dados.cards[0].notes, 'novo');
});

test('recarregar sem gravações aplica a foto e respeita podeAplicar', async () => {
  const store = storeFalso({ cards: [{ id: 'c1', title: 'x', notes: 'base' }] });
  const estado = criarEstado(store);
  await estado.carregar();
  store.db.cards[0] = { ...store.db.cards[0], notes: 'do celular' };
  assert.equal(await estado.recarregar({ podeAplicar: () => false }), false);
  assert.equal(estado.dados.cards[0].notes, 'base');
  assert.equal(await estado.recarregar(), true);
  assert.equal(estado.dados.cards[0].notes, 'do celular');
});

test('excluir card tira o card das fixas que apontavam para ele (como o banco faz)', async () => {
  const e = criarEstado(storeFalso({
    cards: [{ id: 'c1' }],
    commitments: [{ id: 'f1', card_id: 'c1' }, { id: 'f2', card_id: null }],
  }));
  await e.carregar();
  await e.excluir('cards', 'c1');
  assert.deepEqual(e.dados.commitments, [{ id: 'f1', card_id: null }, { id: 'f2', card_id: null }]);
});

test('trocarBlocos cria tudo num lote e só depois tira os antigos; se criar falha, nada sai', async () => {
  const s = storeFalso({ blocks: [{ id: 'a', date: '2026-11-23' }, { id: 'b', date: '2026-11-24' }, { id: 'c', date: '2026-11-25' }] });
  const e = criarEstado(s); await e.carregar();
  s.falhas.add('insert');
  await assert.rejects(e.trocarBlocos(['a', 'b'], [{ date: '2026-11-23', title: 'novo' }]));
  assert.deepEqual(s.db.blocks.map((b) => b.id), ['a', 'b', 'c']);
  s.falhas.delete('insert');
  await e.trocarBlocos(['a', 'b'], [{ date: '2026-11-23', title: 'novo' }, { date: '2026-11-24', title: 'novo 2' }]);
  assert.deepEqual(s.db.blocks.map((b) => b.title || b.id), ['c', 'novo', 'novo 2']);
  assert.deepEqual(e.dados.blocks.map((b) => b.title || b.id), ['c', 'novo', 'novo 2']);
});

test('excluir card ou baralho apaga flashcards, lados e revisões em memória', async () => {
  const s = storeFalso({ cards: [{ id: 'k' }], baralhos: [{ id: 'b' }], revisoes: [{ id: 'r', card_id: 'k' }],
    flashcards: [{ id: 'f1', card_id: 'k' }, { id: 'f2', baralho_id: 'b' }, { id: 'f3', baralho_id: 'x' }],
    flash_lados: [{ id: 'l1', flashcard_id: 'f1' }, { id: 'l2', flashcard_id: 'f2' }, { id: 'l3', flashcard_id: 'f3' }] });
  const e = criarEstado(s); await e.carregar();
  await e.excluir('cards', 'k');
  assert.deepEqual(e.dados.revisoes, []);
  assert.deepEqual(e.dados.flashcards.map((f) => f.id), ['f2', 'f3']);
  await e.excluir('baralhos', 'b');
  assert.deepEqual(e.dados.flashcards.map((f) => f.id), ['f3']);
  assert.deepEqual(e.dados.flash_lados.map((l) => l.id), ['l3']);
  await e.excluir('flashcards', 'f3');
  assert.deepEqual(e.dados.flash_lados, []);
});
