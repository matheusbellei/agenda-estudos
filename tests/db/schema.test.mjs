import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const PG = { host: process.env.PGTEST_HOST || '/var/tmp/pgtest', port: process.env.PGTEST_PORT || '5499' };
const DB = 'estudos_test';
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const TABELAS = ['attachments', 'blocks', 'card_categories', 'cards', 'categories', 'commitments', 'items', 'lists', 'occurrences', 'settings'];
const TABELAS_NOTIF = ['adiamentos', 'baralhos', 'flash_dias', 'flash_lados', 'flashcards', 'focos', 'modelos', 'notificacoes_enviadas', 'push_subscriptions', 'revisoes'];

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

test('as 20 tabelas existem em public com RLS ligado', () => {
  const out = psql(DB, "select tablename||':'||rowsecurity from pg_tables where schemaname='public' order by 1");
  assert.equal(out, [...TABELAS, ...TABELAS_NOTIF].sort().map((t) => `${t}:true`).join('\n'));
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

// ---- Subtags, ícones, card nas fixas e criação automática de card (migração de 2026-11)
test('categoria com parent_id do próprio dono é aceita e tem ícone padrão', () => {
  const mae = id(as(A, `insert into categories(name) values ('Idiomas') returning id`));
  const filha = id(as(A, `insert into categories(name, parent_id) values ('Vocabulário','${mae}') returning id`));
  assert.equal(psql(DB, `select parent_id::text||':'||icon from categories where id='${filha}'`), `${mae}:tag`);
  a.mae = mae; a.filha = filha;
});

test('B não consegue criar subtag apontando para tag de A', () => {
  fails(() => as(B, `insert into categories(name, parent_id) values ('Intrusa','${a.mae}')`), /row-level security/);
});

test('excluir a mãe apaga as subtags', () => {
  as(A, `delete from categories where id='${a.mae}'`);
  assert.equal(psql(DB, `select count(*) from categories where id='${a.filha}'`), '0');
});

test('compromisso pode apontar para card do dono, não para card de outra pessoa', () => {
  const cardA = id(as(A, `insert into cards(title) values ('Fixa com card') returning id`));
  const cardB = id(as(B, `insert into cards(title) values ('Card alheio') returning id`));
  as(A, `insert into commitments(title,days,start_min,end_min,valid_from,card_id) values ('Leitura','{1}',600,660,'2026-11-01','${cardA}')`);
  fails(() => as(A, `insert into commitments(title,days,start_min,end_min,valid_from,card_id) values ('X','{1}',600,660,'2026-11-01','${cardB}')`), /row-level security/);
});

test('settings guarda o modo de criar card e rejeita valor desconhecido', () => {
  as(A, `insert into settings(auto_card) values ('sempre') on conflict (owner_id) do update set auto_card = 'sempre'`);
  assert.equal(psql(DB, `select auto_card from settings where owner_id='${A}'`), 'sempre');
  fails(() => as(A, `update settings set auto_card='talvez'`), /check constraint/);
});

test('migração roda duas vezes sobre o schema antigo e mantém as categorias', () => {
  const VELHO = 'estudos_migracao';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', '92da779:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psql(VELHO, `insert into auth.users values ('${A}','a@x.com')`);
  psql(VELHO, `insert into categories(owner_id,name) values ('${A}','Antiga')`);
  psqlFile(VELHO, 'supabase/migracao-2026-11-subtags.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-subtags.sql');
  assert.equal(psql(VELHO, `select name||':'||coalesce(parent_id::text,'nulo')||':'||icon from categories`), 'Antiga:nulo:tag');
  assert.equal(psql(VELHO, `select count(*) from information_schema.columns where table_name='commitments' and column_name='card_id'`), '1');
  assert.equal(psql(VELHO, `select count(*) from information_schema.columns where table_name='settings' and column_name in ('auto_card','auto_card_list_id')`), '2');
  psql('postgres', `drop database ${VELHO}`);
});

test('mãe e subtag no mesmo insert (restauração do backup em lote) são aceitas', () => {
  const m = '33333333-3333-3333-3333-333333333333';
  as(A, `insert into categories(id, name) values ('${m}','Lote mãe'), (gen_random_uuid(), 'Lote filha') `);
  as(A, `delete from categories where id='${m}'`);
  as(A, `insert into categories(id, name, parent_id) values ('${m}','Lote mãe', null), ('44444444-4444-4444-4444-444444444444','Lote filha','${m}')`);
  assert.equal(psql(DB, `select count(*) from categories where parent_id='${m}'`), '1');
});

// ---- Notificações (migração de 2026-11-23)
test('push_subscriptions: cada um vê e apaga só os próprios aparelhos', () => {
  as(A, `insert into push_subscriptions(endpoint,p256dh,auth,aparelho) values ('https://push.exemplo/a1','k','s','Celular')`);
  assert.equal(as(B, `select count(*) from push_subscriptions`), '0');
  as(B, `delete from push_subscriptions`);
  assert.equal(psql(DB, `select count(*) from push_subscriptions`), '1');
});

test('push_subscriptions: endpoint repetido é recusado', () => {
  fails(() => as(A, `insert into push_subscriptions(endpoint,p256dh,auth) values ('https://push.exemplo/a1','k','s')`), /duplicate key/);
});

test('lembrete_min aceita só os valores da lista, em blocos e fixas', () => {
  as(A, `insert into blocks(date,start_min,end_min,kind,title,lembrete_min) values ('2026-11-23',600,660,'commitment','x',30)`);
  fails(() => as(A, `insert into blocks(date,start_min,end_min,kind,title,lembrete_min) values ('2026-11-23',600,660,'commitment','x',7)`), /check constraint/);
  fails(() => as(A, `insert into commitments(title,days,start_min,end_min,valid_from,lembrete_min) values ('f','{1}',600,660,'2026-11-01',45)`), /check constraint/);
});

test('settings tem os padrões das notificações', () => {
  assert.equal(psql(DB, `select notif_antes_min||':'||notif_resumo||':'||notif_resumo_min||':'||notif_pendencias||':'||notif_pendencias_min||':'||notif_silencio||':'||notif_silencio_de||':'||notif_silencio_ate||':'||fuso from settings where owner_id='${A}'`),
    '10:true:420:true:1290:false:1320:420:America/Sao_Paulo');
});

test('authenticated não lê nem grava notificacoes_enviadas', () => {
  fails(() => as(A, `select count(*) from notificacoes_enviadas`), /permission denied/);
});

test('adiamentos: só do dono', () => {
  as(A, `insert into adiamentos(ref,data,quando) values ('b1','2026-11-23', now())`);
  assert.equal(as(B, `select count(*) from adiamentos`), '0');
});

test('migração de notificações roda 2× sobre o schema da rodada 1', () => {
  const VELHO = 'estudos_migracao_notif';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', '6af6f46:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psql(VELHO, `insert into auth.users values ('${A}','a@x.com')`);
  psql(VELHO, `insert into settings(owner_id) values ('${A}')`);
  psqlFile(VELHO, 'supabase/migracao-2026-11-notificacoes.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-notificacoes.sql');
  assert.equal(psql(VELHO, `select notif_antes_min from settings`), '10');
  assert.equal(psql(VELHO, `select count(*) from information_schema.tables where table_name in ('push_subscriptions','notificacoes_enviadas','adiamentos')`), '3');
  psql('postgres', `drop database ${VELHO}`);
});

// ---- Acompanhamento (migração de 2026-11-24)
test('colunas de acompanhamento têm os padrões', () => {
  const c = id(as(A, `insert into categories(name) values ('Padrão acomp') returning id`));
  assert.equal(psql(DB, `select conta_estudo||':'||coalesce(meta_semanal_min::text,'nulo') from categories where id='${c}'`), 'false:nulo');
  const k = id(as(A, `insert into cards(title) values ('Card acomp') returning id`));
  assert.equal(psql(DB, `select coalesce(meta_min::text,'nulo') from cards where id='${k}'`), 'nulo');
  assert.equal(psql(DB, `select sequencia_min||':'||revisao||':'||revisao_dia||':'||revisao_min from settings where owner_id='${A}'`), '30:true:7:1200');
});

test('metas zero ou negativas e dia de revisão 8 são rejeitados', () => {
  fails(() => as(A, `insert into categories(name, meta_semanal_min) values ('x', 0)`), /check constraint/);
  fails(() => as(A, `insert into cards(title, meta_min) values ('x', -60)`), /check constraint/);
  fails(() => as(A, `update settings set revisao_dia = 8`), /check constraint/);
  fails(() => as(A, `update settings set sequencia_min = 4`), /check constraint/);
  fails(() => as(A, `update settings set sequencia_min = 601`), /check constraint/);
  as(A, `update settings set sequencia_min = 600`);
  as(A, `update settings set sequencia_min = 30`);
  as(A, `insert into categories(name, conta_estudo, meta_semanal_min) values ('Meta ok', true, 600)`);
});

test('migração de acompanhamento roda 2× sobre o schema das notificações', () => {
  const VELHO = 'estudos_migracao_acomp';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', 'e3c7919:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psql(VELHO, `insert into auth.users values ('${A}','a@x.com')`);
  psql(VELHO, `insert into settings(owner_id) values ('${A}')`);
  psql(VELHO, `insert into categories(owner_id,name) values ('${A}','Antiga')`);
  psqlFile(VELHO, 'supabase/migracao-2026-11-acompanhamento.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-acompanhamento.sql');
  assert.equal(psql(VELHO, `select sequencia_min||':'||revisao_dia from settings`), '30:7');
  assert.equal(psql(VELHO, `select name||':'||conta_estudo from categories`), 'Antiga:false');
  assert.equal(psql(VELHO, `select count(*) from information_schema.columns where table_name='cards' and column_name='meta_min'`), '1');
  psql('postgres', `drop database ${VELHO}`);
});

// ---- Modo foco e diário (migração de 2026-11-24)
test('blocks.diario e padrões do foco', () => {
  const b = id(as(A, `insert into blocks(date,start_min,end_min,kind,title) values ('2026-11-24',600,660,'study','x') returning id`));
  assert.equal(psql(DB, `select '['||diario||']' from blocks where id='${b}'`), '[]');
  assert.equal(psql(DB, `select foco_min||':'||pausa_min||':'||pausa_longa_min||':'||ciclos_longa||':'||foco_som from settings where owner_id='${A}'`), '25:5:15:4:true');
  fails(() => as(A, `update settings set foco_min = 3`), /check constraint/);
  fails(() => as(A, `update settings set ciclos_longa = 9`), /check constraint/);
});

test('focos: uma linha por dono, só do dono', () => {
  as(A, `insert into focos(fase, estado, termina_em) values ('foco','rodando', now())`);
  fails(() => as(A, `insert into focos(fase, estado) values ('foco','rodando')`), /duplicate key/);
  assert.equal(as(B, `select count(*) from focos`), '0');
  as(B, `update focos set estado='pausado'`);
  as(B, `delete from focos`);
  assert.equal(psql(DB, `select estado from focos`), 'rodando');
  as(A, `update focos set estado='esperando'`);
  as(A, `delete from focos`);
  assert.equal(psql(DB, `select count(*) from focos`), '0');
});

test('focos rejeita fase ou estado desconhecidos', () => {
  fails(() => as(A, `insert into focos(fase, estado) values ('descanso','rodando')`), /check constraint/);
  fails(() => as(A, `insert into focos(fase, estado) values ('foco','parado')`), /check constraint/);
});

test('migração de foco e diário roda 2× sobre o schema da rodada 2', () => {
  const VELHO = 'estudos_migracao_foco';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', '8fce61f:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psql(VELHO, `insert into auth.users values ('${A}','a@x.com')`);
  psql(VELHO, `insert into settings(owner_id) values ('${A}')`);
  psqlFile(VELHO, 'supabase/migracao-2026-11-foco-diario.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-foco-diario.sql');
  assert.equal(psql(VELHO, `select foco_min||':'||ciclos_longa from settings`), '25:4');
  assert.equal(psql(VELHO, `select count(*) from information_schema.columns where table_name='blocks' and column_name='diario'`), '1');
  assert.equal(psql(VELHO, `select rowsecurity from pg_tables where tablename='focos'`), 't');
  psql('postgres', `drop database ${VELHO}`);
});

// ---- Modelos de semana e revisão espaçada (migração de 2026-11-24)
test('modelos e revisões: padrões, validação e nome único', () => {
  assert.equal(psql(DB, `select revisoes_dias::text||':'||modelos_com_fixas from settings where owner_id='${A}'`), '{7,30}:false');
  for (const v of ["'{}'", "'{0}'", "'{30,7}'", "'{7,7}'", "'{1,2,3,4,5,6,7}'", "'{400}'"]) {
    fails(() => as(A, `update settings set revisoes_dias = ${v}`), /check constraint/);
  }
  as(A, `update settings set revisoes_dias = '{3,10,30}'`);
  as(A, `insert into modelos(nome, blocos) values ('Semana de prova', '[]')`);
  fails(() => as(A, `insert into modelos(nome) values ('semana de PROVA')`), /duplicate key/);
  as(B, `insert into modelos(nome) values ('Semana de prova')`);
});

test('modelos e revisões: só do dono', () => {
  const c = id(as(A, `insert into cards(title) values ('Card revisão') returning id`));
  as(A, `insert into revisoes(card_id, data) values ('${c}', '2026-12-01')`);
  assert.equal(as(B, `select count(*) from revisoes`), '0');
  assert.equal(as(B, `select count(*) from modelos where nome = 'Semana de prova' and owner_id = '${A}'`), '0');
  as(B, `update revisoes set status = 'feita'`);
  as(B, `delete from revisoes`);
  assert.equal(psql(DB, `select status from revisoes where card_id='${c}'`), 'pendente');
  fails(() => as(A, `insert into revisoes(card_id, data, status) values ('${c}', '2026-12-02', 'talvez')`), /check constraint/);
});

test('apagar o card apaga as revisões e solta o bloco', () => {
  const c = id(as(A, `insert into cards(title) values ('Card que some') returning id`));
  const r = id(as(A, `insert into revisoes(card_id, data) values ('${c}', '2026-12-01') returning id`));
  const b = id(as(A, `insert into blocks(date,start_min,end_min,kind,title,revisao_id) values ('2026-12-01',600,660,'study','Revisão','${r}') returning id`));
  as(A, `delete from revisoes where id='${r}'`);
  assert.equal(psql(DB, `select coalesce(revisao_id::text,'nulo') from blocks where id='${b}'`), 'nulo');
  as(A, `insert into revisoes(card_id, data) values ('${c}', '2026-12-02')`);
  as(A, `delete from cards where id='${c}'`);
  assert.equal(psql(DB, `select count(*) from revisoes where card_id='${c}'`), '0');
});

test('migração de modelos e revisões roda 2× sobre o schema da rodada 3', () => {
  const VELHO = 'estudos_migracao_modelos';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', 'dd9719b:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psql(VELHO, `insert into auth.users values ('${A}','a@x.com')`);
  psql(VELHO, `insert into settings(owner_id) values ('${A}')`);
  psqlFile(VELHO, 'supabase/migracao-2026-11-modelos-revisoes.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-modelos-revisoes.sql');
  assert.equal(psql(VELHO, `select revisoes_dias::text from settings`), '{7,30}');
  assert.equal(psql(VELHO, `select count(*) from pg_tables where tablename in ('modelos','revisoes') and rowsecurity`), '2');
  psql('postgres', `drop database ${VELHO}`);
});

test('revisão não pode passar a apontar para card de outra pessoa', () => {
  const ca = id(as(A, `insert into cards(title) values ('Card de A rev') returning id`));
  const cb = id(as(B, `insert into cards(title) values ('Card de B rev') returning id`));
  const r = id(as(A, `insert into revisoes(card_id, data) values ('${ca}', '2026-12-01') returning id`));
  fails(() => as(A, `update revisoes set card_id = '${cb}' where id = '${r}'`), /row-level security/);
});

// ---- Flashcards (migração de 2026-11-24)
test('flashcards: padrões e validações', () => {
  assert.equal(psql(DB, `select flash_card_novos_dia||':'||flash_card_revisoes_dia||':'||flash_card_fator||':'||flash_aviso||':'||flash_aviso_min from settings where owner_id='${A}'`), '20:200:2.5:true:1140');
  const bar = id(as(A, `insert into baralhos(nome) values ('Vocabulário') returning id`));
  assert.equal(psql(DB, `select fator||':'||novos_dia||':'||revisoes_dia from baralhos where id='${bar}'`), '2.5:20:200');
  fails(() => as(A, `insert into baralhos(nome) values ('vocabulário ')`), /duplicate key/);
  fails(() => as(A, `insert into baralhos(nome, fator) values ('X', 1.2)`), /check constraint/);
  fails(() => as(A, `insert into baralhos(nome, novos_dia) values ('Y', -1)`), /check constraint/);
  fails(() => as(A, `insert into flashcards(tipo, frente) values ('basico', 'sem dono')`), /check constraint/);
  const card = id(as(A, `insert into cards(title) values ('Card flash') returning id`));
  fails(() => as(A, `insert into flashcards(baralho_id, card_id, tipo, frente) values ('${bar}', '${card}', 'basico', 'dois')`), /check constraint/);
  fails(() => as(A, `insert into flashcards(baralho_id, tipo, frente) values ('${bar}', 'talvez', 'x')`), /check constraint/);
  const f = id(as(A, `insert into flashcards(baralho_id, tipo, frente, verso) values ('${bar}', 'invertido', 'perro', 'cachorro') returning id`));
  as(A, `insert into flash_lados(flashcard_id, lado) values ('${f}', 'frente')`);
  fails(() => as(A, `insert into flash_lados(flashcard_id, lado) values ('${f}', 'frente')`), /duplicate key/);
  as(A, `insert into flash_dias(data, revisados, acertos) values ('2026-11-24', 3, 2)`);
  fails(() => as(A, `insert into flash_dias(data) values ('2026-11-24')`), /duplicate key/);
});

test('flashcards: só do dono e sem apontar para coisa de outro', () => {
  const barA = id(as(A, `insert into baralhos(nome) values ('De A') returning id`));
  const cardA = id(as(A, `insert into cards(title) values ('Card de A flash') returning id`));
  const fA = id(as(A, `insert into flashcards(baralho_id, tipo, frente) values ('${barA}', 'basico', 'pergunta de A') returning id`));
  for (const t of ['baralhos', 'flashcards', 'flash_lados', 'flash_dias']) assert.equal(as(B, `select count(*) from ${t} where owner_id = '${A}'`), '0');
  fails(() => as(B, `insert into flashcards(baralho_id, tipo, frente) values ('${barA}', 'basico', 'intrusa')`), /row-level security/);
  fails(() => as(B, `insert into flashcards(card_id, tipo, frente) values ('${cardA}', 'basico', 'intrusa')`), /row-level security/);
  fails(() => as(B, `insert into flash_lados(flashcard_id, lado) values ('${fA}', 'frente')`), /row-level security/);
  const barB = id(as(B, `insert into baralhos(nome) values ('De B') returning id`));
  fails(() => as(A, `update flashcards set baralho_id = '${barB}' where id = '${fA}'`), /row-level security/);
});

test('apagar baralho ou card apaga os flashcards e os lados', () => {
  const bar = id(as(A, `insert into baralhos(nome) values ('Some') returning id`));
  const f = id(as(A, `insert into flashcards(baralho_id, tipo, frente) values ('${bar}', 'basico', 'x') returning id`));
  as(A, `insert into flash_lados(flashcard_id, lado) values ('${f}', 'frente')`);
  as(A, `delete from baralhos where id = '${bar}'`);
  assert.equal(psql(DB, `select count(*) from flash_lados where flashcard_id = '${f}'`), '0');
  const card = id(as(A, `insert into cards(title) values ('Card some') returning id`));
  const g = id(as(A, `insert into flashcards(card_id, tipo, frente) values ('${card}', 'basico', 'y') returning id`));
  as(A, `delete from cards where id = '${card}'`);
  assert.equal(psql(DB, `select count(*) from flashcards where id = '${g}'`), '0');
});

test('migração de flashcards roda 2× sobre o schema da rodada 4', () => {
  const VELHO = 'estudos_migracao_flash';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', '1c272c4:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psql(VELHO, `insert into auth.users values ('${A}','a@x.com')`);
  psql(VELHO, `insert into settings(owner_id) values ('${A}')`);
  psqlFile(VELHO, 'supabase/migracao-2026-11-flashcards.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-flashcards.sql');
  assert.equal(psql(VELHO, `select flash_aviso_min from settings`), '1140');
  assert.equal(psql(VELHO, `select count(*) from pg_tables where tablename in ('baralhos','flashcards','flash_lados','flash_dias') and rowsecurity`), '4');
  psql('postgres', `drop database ${VELHO}`);
});

test('flash_somar_dia soma de forma atômica e só no dono', () => {
  as(A, `select public.flash_somar_dia('2026-12-02', 1)`);
  as(A, `select public.flash_somar_dia('2026-12-02', 0)`);
  as(B, `select public.flash_somar_dia('2026-12-02', 1)`);
  assert.equal(psql(DB, `select revisados||':'||acertos from flash_dias where owner_id='${A}' and data='2026-12-02'`), '2:1');
  assert.equal(psql(DB, `select revisados||':'||acertos from flash_dias where owner_id='${B}' and data='2026-12-02'`), '1:1');
});

test('migração dos ajustes roda 2× sobre o schema da rodada 5 (archived_at e dia inteiro)', () => {
  const VELHO = 'estudos_migracao_ajustes';
  psql('postgres', `drop database if exists ${VELHO}`);
  psql('postgres', `create database ${VELHO}`);
  psqlFile(VELHO, 'tests/db/supabase-stub.sql');
  const antigo = execFileSync('git', ['show', '9482541:supabase/schema.sql'], { encoding: 'utf8' });
  execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', VELHO, '-v', 'ON_ERROR_STOP=1', '-q'], { input: antigo });
  psqlFile(VELHO, 'supabase/migracao-2026-11-ajustes.sql');
  psqlFile(VELHO, 'supabase/migracao-2026-11-ajustes.sql');
  assert.equal(psql(VELHO, `select data_type from information_schema.columns where table_name = 'cards' and column_name = 'archived_at'`), 'timestamp with time zone');
  assert.equal(psql(VELHO, `select column_default from information_schema.columns where table_name = 'settings' and column_name = 'day_end_min'`), '1440');
  assert.equal(psql(VELHO, `select count(*) from information_schema.columns where table_name = 'blocks' and column_name = 'motivo'`), '1');
  psql('postgres', `drop database ${VELHO}`);
});

test('schema atual tem cards.archived_at', () => {
  assert.equal(psql(DB, `select count(*) from information_schema.columns where table_name = 'cards' and column_name = 'archived_at'`), '1');
});

test('grupos de baralhos: baralho dentro de grupo meu; não dentro de baralho comum, de grupo alheio nem de si mesmo', () => {
  const g = id(as(A, `insert into baralhos (nome, e_grupo) values ('Idiomas', true) returning id`));
  const d = id(as(A, `insert into baralhos (nome, pai_id) values ('Verbos', '${g}') returning id`));
  assert.equal(psql(DB, `select pai_id from baralhos where id = '${d}'`), g);
  assert.throws(() => as(A, `insert into baralhos (nome, pai_id) values ('Dentro de baralho', '${d}')`));
  assert.throws(() => as(B, `insert into baralhos (nome, pai_id) values ('Invasor', '${g}')`));
  assert.throws(() => as(A, `update baralhos set pai_id = id where id = '${g}'`));
  // excluir o grupo deixa o baralho sem grupo (o app sobe os filhos antes)
  as(A, `delete from baralhos where id = '${g}'`);
  assert.equal(psql(DB, `select coalesce(pai_id::text, 'nulo') from baralhos where id = '${d}'`), 'nulo');
});
