// Teste de ponta a ponta da função "lembretes", o mais perto possível do Supabase de verdade:
//   Postgres com o schema.sql inteiro + PostgREST real (em /rest/v1, como no Supabase)
//   + a própria supabase/functions/lembretes/index.ts rodando no Deno
//   + um "serviço de push" local que recebe o POST, confere o VAPID e DECIFRA a mensagem com a chave do aparelho.
// Não faz parte do `npm test` (precisa dos binários). Rode:
//   POSTGREST=/caminho/postgrest DENO=/caminho/deno node tests/e2e/funcao-real.mjs
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import { createECDH, randomBytes, createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import ece from 'http_ece';
import { gerarChavesVapid } from '../../supabase/functions/lembretes/webpush.js';

const PG = { host: '/var/tmp/pgtest', port: '5499' };
const DB = 'estudos_e2e';
const JWT_SECRET = 'segredo-jwt-de-teste-com-mais-de-32-caracteres';
const SEGREDO = 'senha-do-agendador-de-teste';
const PORTAS = { rest: 18300, proxy: 18301, push: 18302, funcao: 18303 };
const DONO = randomUUID();
const filhos = [];
const sair = (c) => { for (const f of filhos) { try { f.kill('SIGKILL'); } catch { /* já saiu */ } } process.exit(c); };

const psql = (db, sql) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', sql], { encoding: 'utf8' }).trim();
const psqlArq = (db, arq) => execFileSync('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '-f', arq], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const b64u = (b) => Buffer.from(b).toString('base64url');
function jwt(claims) {
  const c = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })); const p = b64u(JSON.stringify(claims));
  return `${c}.${p}.${b64u(createHmac('sha256', JWT_SECRET).update(`${c}.${p}`).digest())}`;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(fn, ms = 15000) { const fim = Date.now() + ms; for (;;) { try { const v = await fn(); if (v) return v; } catch { /* ainda não */ } if (Date.now() > fim) throw new Error('tempo esgotado'); await esperar(200); } }

// ---- banco: schema inteiro, como no projeto
psql('postgres', `drop database if exists ${DB}`);
psql('postgres', `create database ${DB}`);
psql(DB, `do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit; end if; end $$`);
psqlArq(DB, 'tests/db/supabase-stub.sql');
psqlArq(DB, 'supabase/schema.sql');
psql(DB, 'grant anon, authenticated, service_role to authenticator');
psql(DB, `insert into auth.users (id, email) values ('${DONO}', 'dono@exemplo.com')`);

// ---- PostgREST real, e um proxy que põe em /rest/v1 (como no Supabase)
filhos.push(spawn(process.env.POSTGREST, [], { env: { ...process.env,
  PGRST_DB_URI: `postgres://authenticator@/${DB}?host=${PG.host}&port=${PG.port}`, PGRST_DB_SCHEMAS: 'public', PGRST_DB_ANON_ROLE: 'anon',
  PGRST_JWT_SECRET: JWT_SECRET, PGRST_SERVER_PORT: String(PORTAS.rest), PGRST_SERVER_HOST: '127.0.0.1', PGRST_LOG_LEVEL: 'crit' }, stdio: 'inherit' }));
http.createServer((req, res) => {
  if (!req.url.startsWith('/rest/v1/')) { res.writeHead(404); res.end(); return; }
  const p = http.request({ host: '127.0.0.1', port: PORTAS.rest, path: req.url.slice('/rest/v1'.length), method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(p);
}).listen(PORTAS.proxy, '127.0.0.1');

// ---- "serviço de push": confere o cabeçalho VAPID e decifra com a chave privada do aparelho
const aparelho = createECDH('prime256v1'); aparelho.generateKeys();
const authAparelho = randomBytes(16);
const recebidas = [];
let respostaPush = 201;
http.createServer((req, res) => {
  const partes = [];
  req.on('data', (d) => partes.push(d));
  req.on('end', () => {
    try {
      assert.match(req.headers.authorization || '', /^vapid t=[^,]+, k=/);
      assert.equal(req.headers['content-encoding'], 'aes128gcm');
      const claro = ece.decrypt(Buffer.concat(partes), { version: 'aes128gcm', privateKey: aparelho, authSecret: b64u(authAparelho) });
      recebidas.push(JSON.parse(claro.toString('utf8')));
    } catch (e) { recebidas.push({ ERRO: String(e.message) }); }
    res.writeHead(respostaPush); res.end();
  });
}).listen(PORTAS.push, '127.0.0.1');

// ---- a função de verdade (index.ts) no Deno, com a chave de serviço no formato antigo (JWT service_role)
const vapid = await gerarChavesVapid();
filhos.push(spawn(process.env.DENO, ['run', '--allow-net', '--allow-env', 'supabase/functions/lembretes/index.ts'], { env: { ...process.env,
  SUPABASE_URL: `http://127.0.0.1:${PORTAS.proxy}`, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', exp: 9999999999 }),
  LEMBRETES_SEGREDO: SEGREDO, VAPID_PUBLIC_KEY: vapid.publica, VAPID_PRIVATE_KEY: vapid.privada, VAPID_SUBJECT: 'mailto:teste@exemplo.com',
  DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${PORTAS.funcao}`, PORT: String(PORTAS.funcao) }, stdio: 'inherit' }));

const URL_FUNCAO = `http://127.0.0.1:${PORTAS.funcao}`;
const tique = async (segredo = SEGREDO) => { const r = await fetch(URL_FUNCAO, { method: 'POST', headers: { 'x-lembretes-segredo': segredo, 'Content-Type': 'application/json' }, body: '{}' }); return { status: r.status, corpo: await r.json() }; };

try {
  await ate(async () => (await fetch(`http://127.0.0.1:${PORTAS.proxy}/rest/v1/`)).status < 500);
  await ate(async () => { const r = await fetch(URL_FUNCAO); return r.status === 404; });

  // Agora em São Paulo, e um bloco que começa daqui a 10 min (o lembrete padrão vence neste minuto).
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hoje = `${p.year}-${p.month}-${p.day}`;
  const minuto = Number(p.hour) * 60 + Number(p.minute);
  if (minuto > 1440 - 15) { console.log('Perto da meia-noite: rode de novo daqui a 20 min.'); sair(0); }
  const dia = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const dow = new Date(`${hoje}T12:00:00-03:00`).getUTCDay();

  psql(DB, `insert into public.push_subscriptions (owner_id, endpoint, p256dh, auth, aparelho) values
    ('${DONO}', 'http://127.0.0.1:${PORTAS.push}/push/aparelho1', '${b64u(aparelho.getPublicKey())}', '${b64u(authAparelho)}', 'Chrome no Android')`);
  psql(DB, `insert into public.blocks (owner_id, date, start_min, end_min, kind, title, status) values
    ('${DONO}', '${hoje}', ${minuto + 10}, ${minuto + 70}, 'commitment', 'Bloco de teste', 'planned')`);

  // 1) segredo errado: 401, nada sai
  assert.equal((await tique('errado')).status, 401);

  // 2) tique de verdade: o aparelho recebe e decifra o lembrete
  const r1 = await tique();
  assert.equal(r1.status, 200, JSON.stringify(r1.corpo));
  assert.equal(r1.corpo.enviadas, 1, `a função deveria enviar 1 lembrete: ${JSON.stringify(r1.corpo)}`);
  await ate(() => recebidas.length === 1);
  assert.equal(recebidas[0].titulo, 'Bloco de teste', JSON.stringify(recebidas[0]));
  assert.match(recebidas[0].corpo, /^Começa às \d\d:\d\d \(em 10 min\)$/);
  assert.deepEqual(recebidas[0].acoes.map((a) => a.acao), ['cumprir', 'adiar']);
  console.log('ok  lembrete do bloco chegou ao aparelho e foi decifrado:', recebidas[0].corpo);

  // 3) o mesmo minuto de novo: não repete
  assert.equal((await tique()).corpo.enviadas, 0);
  assert.equal(psql(DB, `select ultimo_status from public.push_subscriptions`), '201');
  assert.ok(psql(DB, `select ultimo_ok from public.push_subscriptions`));
  assert.ok(psql(DB, `select ultimo_tique from public.lembretes_status where id = 1`));
  console.log('ok  não repete; status 201 e último tique registrados');

  // 4) bloco de uma fixa (compromisso semanal) também avisa
  psql(DB, `insert into public.commitments (owner_id, title, days, start_min, end_min, valid_from) values
    ('${DONO}', 'Fixa de teste', '{${dow}}', ${minuto + 10}, ${minuto + 40}, '${hoje}')`);
  const r2 = await tique();
  assert.equal(r2.corpo.enviadas, 1, JSON.stringify(r2.corpo));
  await ate(() => recebidas.length === 2);
  assert.equal(recebidas[1].titulo, 'Fixa de teste');
  console.log('ok  lembrete da fixa chegou:', recebidas[1].corpo);

  // 5) botão "Cumprido" da notificação marca o bloco (sem abrir o app)
  const r3 = await fetch(recebidas[0].acoes[0].url.replace(/^https?:\/\/[^/]+\/functions\/v1\/lembretes/, URL_FUNCAO));
  assert.equal(r3.status, 200);
  assert.equal(psql(DB, `select status from public.blocks where title = 'Bloco de teste'`), 'done');
  console.log('ok  "Cumprido" pela notificação marcou o bloco');

  // 6) serviço de push fora do ar: o mesmo aviso é tentado de novo no tique seguinte
  respostaPush = 503;
  psql(DB, `insert into public.blocks (owner_id, date, start_min, end_min, kind, title, status) values
    ('${DONO}', '${hoje}', ${minuto + 10}, ${minuto + 20}, 'commitment', 'Outro bloco', 'planned')`);
  await tique();
  assert.equal(psql(DB, `select count(*) from public.notificacoes_enviadas where chave like 'antes:%' and chave not like 'antes:v:%'`), '1');
  respostaPush = 201;
  const antes = recebidas.length;
  await tique();
  await ate(() => recebidas.length === antes + 1);
  assert.equal(recebidas.at(-1).titulo, 'Outro bloco');
  console.log('ok  com o push fora do ar, o aviso saiu no tique seguinte');

  console.log('\nTUDO CERTO: a função real, com o PostgREST real, entregou e o aparelho decifrou.');
  sair(0);
} catch (e) {
  console.error('FALHOU:', e.message);
  sair(1);
}
