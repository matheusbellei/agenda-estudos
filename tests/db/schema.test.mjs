import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const PG = { host: process.env.PGTEST_HOST || '/var/tmp/pgtest', port: process.env.PGTEST_PORT || '5499' };
const DB = 'estudos_test';
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const TABELAS = ['attachments', 'blocks', 'card_categories', 'cards', 'categories', 'commitments', 'items', 'lists', 'occurrences', 'settings'];

function psql(db, sql) {
  return execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function psqlFile(db, file) {
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-q', '-f', file], { stdio: ['ignore', 'pipe', 'pipe'] });
}
// Executa SQL como um usuário logado (ou anon quando uid é null).
function as(uid, sql) {
  const role = uid ? 'authenticated' : 'anon';
  const claim = uid ? `set local request.jwt.claim.sub = '${uid}';` : '';
  return psql(DB, `begin; set local role ${role}; ${claim} ${sql}; commit;`);
}
function fails(fn, re) { assert.throws(fn, (e) => re.test(String(e.stderr || e.message))); }
// Insere com "returning id" e devolve só o id (psql -q ainda imprime o "INSERT 0 1", então pega a primeira linha).
const id = (out) => out.split('\n')[0];

before(() => {
  psql('postgres', `drop database if exists ${DB}`);
  psql('postgres', `create database ${DB}`);
  psqlFile(DB, 'tests/db/supabase-stub.sql');
  psqlFile(DB, 'supabase/schema.sql');
  psql(DB, `insert into auth.users values ('${A}','a@x.com'),('${B}','b@x.com')`);
});

// Dados de A usados pelos testes seguintes.
const a = {};

test('as 10 tabelas existem em public com RLS ligado', () => {
  const out = psql(DB, "select tablename||':'||rowsecurity from pg_tables where schemaname='public' order by 1");
  assert.equal(out, TABELAS.map((t) => `${t}:true`).join('\n'));
});

test('usuário A grava categoria, lista, card, item e bloco, e owner_id é preenchido sozinho', () => {
  a.cat = id(as(A, `insert into categories(name) values ('Idiomas') returning id`));
  a.lista = id(as(A, `insert into lists(name,position) values ('Em andamento',1) returning id`));
  a.card = id(as(A, `insert into cards(title,list_id) values ('Curso de Python','${a.lista}') returning id`));
  a.item = id(as(A, `insert into items(card_id,title) values ('${a.card}','Aula 1') returning id`));
  a.bloco = id(as(A, `insert into blocks(date,start_min,end_min,kind,title,card_id,item_id)
                      values ('2026-11-17',600,660,'study','Curso de Python','${a.card}','${a.item}') returning id`));
  as(A, `insert into occurrences(card_id,date,status) values ('${a.card}','2026-11-10','done')`);
  as(A, `insert into attachments(card_id,kind,name,url) values ('${a.card}','link','Site','https://x.com')`);
  as(A, `insert into card_categories(card_id,category_id) values ('${a.card}','${a.cat}')`);
  as(A, `insert into settings default values`);
  as(A, `insert into commitments(title,days,start_min,end_min,valid_from) values ('Trabalho','{1,2}',480,1020,'2026-11-01')`);
  for (const t of TABELAS) {
    assert.equal(psql(DB, `select count(*) from ${t} where owner_id='${A}'`), '1', t);
  }
  assert.equal(psql(DB, `select count(*) from cards where owner_id is null`), '0');
});

test('usuário B não vê nenhuma linha de A em nenhuma tabela', () => {
  for (const t of TABELAS) assert.equal(as(B, `select count(*) from ${t}`), '0', t);
});

test('B não consegue alterar nem excluir linhas de A', () => {
  assert.equal(as(B, `with u as (update cards set title='x' where id='${a.card}' returning 1) select count(*) from u`), '0');
  assert.equal(as(B, `with d as (delete from cards where id='${a.card}' returning 1) select count(*) from d`), '0');
  assert.equal(as(B, `with u as (update items set title='x' where id='${a.item}' returning 1) select count(*) from u`), '0');
  assert.equal(as(B, `with d as (delete from blocks where id='${a.bloco}' returning 1) select count(*) from d`), '0');
  assert.equal(psql(DB, `select title from cards where id='${a.card}'`), 'Curso de Python');
  assert.equal(psql(DB, `select count(*) from blocks where id='${a.bloco}'`), '1');
});

test('B não consegue inserir item apontando para card de A', () => {
  fails(() => as(B, `insert into items(card_id,title) values ('${a.card}','invasor')`), /row-level security/);
});

test('B não consegue inserir bloco apontando para card de A', () => {
  fails(() => as(B, `insert into blocks(date,start_min,end_min,kind,card_id) values ('2026-11-17',600,660,'study','${a.card}')`), /row-level security/);
});

test('visitante anon recebe permission denied', () => {
  fails(() => as(null, 'select * from cards'), /permission denied/);
});

test('bloco com início igual ao fim ou fim depois da meia-noite é rejeitado', () => {
  fails(() => as(A, `insert into blocks(date,start_min,end_min,kind) values ('2026-11-17',600,600,'study')`), /check constraint/);
  fails(() => as(A, `insert into blocks(date,start_min,end_min,kind) values ('2026-11-17',600,1441,'study')`), /check constraint/);
});

test('dois blocos com o mesmo (commitment_id, date) são rejeitados', () => {
  const c = psql(DB, `select id from commitments where owner_id='${A}'`);
  const ins = `insert into blocks(date,start_min,end_min,kind,commitment_id) values ('2026-11-18',480,1020,'commitment','${c}')`;
  as(A, ins);
  fails(() => as(A, ins), /duplicate key/);
});

test('duas ocorrências com o mesmo (card_id, date) são rejeitadas', () => {
  fails(() => as(A, `insert into occurrences(card_id,date,status) values ('${a.card}','2026-11-10','missed')`), /duplicate key/);
});

test('trello_id repetido para o mesmo dono é rejeitado; nulo repetido é permitido', () => {
  as(A, `insert into cards(title,trello_id) values ('T1','abc')`);
  fails(() => as(A, `insert into cards(title,trello_id) values ('T2','abc')`), /duplicate key/);
  as(B, `insert into cards(title,trello_id) values ('T3','abc')`);
  as(A, `insert into cards(title) values ('N1')`);
  as(A, `insert into cards(title) values ('N2')`);
});

test('excluir um card apaga itens, anexos e ocorrências e mantém os blocos com o título', () => {
  as(A, `delete from cards where id='${a.card}'`);
  for (const t of ['items', 'attachments', 'occurrences']) {
    assert.equal(psql(DB, `select count(*) from ${t} where card_id='${a.card}'`), '0', t);
  }
  assert.equal(psql(DB, `select coalesce(card_id::text,'nulo')||':'||title from blocks where id='${a.bloco}'`), 'nulo:Curso de Python');
});

test('inserir com owner_id de outra pessoa é rejeitado', () => {
  fails(() => as(A, `insert into categories(name, owner_id) values ('Forjada','${B}')`), /row-level security/);
  fails(() => as(A, `insert into cards(title, owner_id) values ('Forjado','${B}')`), /row-level security/);
});

test('update não consegue apontar um filho para o pai de outra pessoa', () => {
  const cardA = id(as(A, `insert into cards(title) values ('Leitura do capítulo') returning id`));
  const itemA = id(as(A, `insert into items(card_id,title) values ('${cardA}','Parte 1') returning id`));
  const cardB = id(as(B, `insert into cards(title) values ('Card de B') returning id`));
  fails(() => as(A, `update items set card_id='${cardB}' where id='${itemA}'`), /row-level security/);
  fails(() => as(A, `update cards set owner_id='${B}' where id='${cardA}'`), /row-level security/);
  assert.equal(psql(DB, `select card_id from items where id='${itemA}'`), cardA);
});

test('compromisso com horário fora de 0..1440 ou dia fora de 1..7 é rejeitado', () => {
  const ins = (dias, ini, fim) => `insert into commitments(title,days,start_min,end_min,valid_from) values ('X','${dias}',${ini},${fim},'2026-11-01')`;
  fails(() => as(A, ins('{1}', 600, 600)), /check constraint/);
  fails(() => as(A, ins('{1}', -10, 600)), /check constraint/);
  fails(() => as(A, ins('{1}', 600, 1441)), /check constraint/);
  fails(() => as(A, ins('{0}', 600, 660)), /check constraint/);
  fails(() => as(A, ins('{1,8}', 600, 660)), /check constraint/);
  as(A, ins('{1,7}', 0, 1440));
});

test('authenticated só tem select, insert, update e delete; anon nada', () => {
  for (const priv of ['TRUNCATE', 'REFERENCES', 'TRIGGER']) {
    assert.equal(psql(DB, `select has_table_privilege('authenticated','public.cards','${priv}')`), 'f', priv);
  }
  assert.equal(psql(DB, `select has_table_privilege('anon','public.cards','SELECT')`), 'f');
  assert.equal(psql(DB, `select has_table_privilege('authenticated','public.cards','UPDATE')`), 't');
});
