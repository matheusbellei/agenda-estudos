// Entrada da Edge Function no Supabase (Deno). Liga o serviço ao banco (API REST do próprio projeto,
// com a chave de serviço que o Supabase já entrega à função) e ao envio de Web Push.
// Não edite o index.ts à mão: ele é gerado a partir deste arquivo por `npm run gerar-funcao`.
import { criarServico } from './servico.js';
import { enviarPush } from './webpush.js';

const env = (nome) => Deno.env.get(nome) || '';
const URL_PROJETO = env('SUPABASE_URL');
// Chave de serviço: a nova (sb_secret_…, em SUPABASE_SECRET_KEYS) ou, se não houver, a antiga service_role.
function chaveDeServico() {
  try { const k = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}').default; if (k) return k; } catch { /* sem chaves novas */ }
  return env('SUPABASE_SERVICE_ROLE_KEY');
}
const CHAVE_SERVICO = chaveDeServico();
// A chave nova não é um JWT: vai só no cabeçalho apikey. A antiga também vai como Bearer.
const base = CHAVE_SERVICO.startsWith('sb_secret_') ? { apikey: CHAVE_SERVICO } : { apikey: CHAVE_SERVICO, Authorization: `Bearer ${CHAVE_SERVICO}` };

// Filtros do serviço → PostgREST: valor = igual; { in: [...] }; { lt: x }; { gte: x, lte: y }.
function consulta(filtros = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v && typeof v === 'object' && 'in' in v) p.append(k, `in.(${v.in.map((x) => `"${x}"`).join(',')})`);
    else if (v && typeof v === 'object' && 'lt' in v) p.append(k, `lt.${v.lt}`);
    else if (v && typeof v === 'object' && 'gte' in v) { p.append(k, `gte.${v.gte}`); if ('lte' in v) p.append(k, `lte.${v.lte}`); }
    else p.append(k, `eq.${v}`);
  }
  return p;
}

async function pedir(caminho, init) {
  const r = await fetch(`${URL_PROJETO}/rest/v1/${caminho}`, { ...init, headers: { ...base, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${caminho.split('?')[0]}: ${r.status} ${await r.text()}`);
  const texto = await r.text();
  return texto ? JSON.parse(texto) : [];
}

const CONFLITO = { notificacoes_enviadas: 'owner_id,chave' };

const banco = {
  select: (t, f) => { const q = consulta(f); q.set('select', '*'); return pedir(`${t}?${q}`); },
  insert: (t, linha, { ignorarConflito } = {}) => pedir(`${t}${ignorarConflito && CONFLITO[t] ? `?on_conflict=${CONFLITO[t]}` : ''}`, {
    method: 'POST', body: JSON.stringify(linha),
    headers: { Prefer: `return=representation${ignorarConflito ? ',resolution=ignore-duplicates' : ''}` },
  }),
  update: (t, f, campos) => pedir(`${t}?${consulta(f)}`, { method: 'PATCH', body: JSON.stringify(campos), headers: { Prefer: 'return=representation' } }),
  remove: (t, f) => pedir(`${t}?${consulta(f)}`, { method: 'DELETE' }),
  // Grava ou atualiza pela chave primária (id), mudando só as colunas enviadas.
  salvar: (t, linha) => pedir(`${t}?on_conflict=id`, {
    method: 'POST', body: JSON.stringify(linha), headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
  }),
  async usuarioDoJwt(jwt) {
    const r = await fetch(`${URL_PROJETO}/auth/v1/user`, { headers: { apikey: CHAVE_SERVICO, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id } : null;
  },
};

const vapid = { publica: env('VAPID_PUBLIC_KEY'), privada: env('VAPID_PRIVATE_KEY'), assunto: env('VAPID_SUBJECT') || 'mailto:agenda@exemplo.com' };
const servico = criarServico({
  banco,
  enviar: (inscricao, payload) => enviarPush({ inscricao, payload, vapid }),
  env: { SUPABASE_URL: URL_PROJETO, LEMBRETES_SEGREDO: env('LEMBRETES_SEGREDO'), VAPID_PUBLIC_KEY: vapid.publica, VAPID_PRIVADA_OK: Boolean(vapid.privada) },
});

Deno.serve((req) => servico.tratar(req));
