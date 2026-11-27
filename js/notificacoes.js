// Notificações neste aparelho: pedir permissão, inscrever no push do navegador e guardar a inscrição
// (push_subscriptions) para a função "lembretes" do Supabase saber para onde mandar.
const TABELA = 'push_subscriptions';

function deB64u(texto) {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// O service worker precisa saber, com o app fechado, para onde avisar se o navegador trocar a inscrição.
const CACHE_INSCRICAO = 'agenda-inscricao';

export async function guardarParaOSW(store, endpoint) {
  try {
    const cache = await caches.open(CACHE_INSCRICAO);
    await cache.put('dados', new Response(JSON.stringify({ funcao: store.urlDaFuncao('lembretes'), vapid: await store.vapidPublica(), endpoint })));
  } catch { /* sem cache no navegador: a troca em segundo plano não funciona, mas o app refaz ao abrir */ }
}

// O que este aparelho ativou antes (endereço da inscrição); vazio se nunca ativou ou se desativou.
export async function lembradoPeloOSW() {
  try {
    const r = await (await caches.open(CACHE_INSCRICAO)).match('dados');
    return r ? await r.json() : null;
  } catch { return null; }
}

export async function esquecerParaOSW() {
  try { await (await caches.open(CACHE_INSCRICAO)).delete('dados'); } catch { /* idem */ }
}

export async function suporte(store) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'sem-suporte';
  if (!(await store.vapidPublica())) return 'sem-chave';
  return 'ok';
}

// Nome amigável para a lista de aparelhos ("Chrome no Android").
export function nomeDoAparelho(ua = navigator.userAgent) {
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPhone' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return so ? `${nav} no ${so}` : nav;
}

async function inscricaoDoNavegador() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function aparelhos(store) {
  return store.list(TABELA);
}

// 'sem-suporte' | 'sem-chave' | 'bloqueado' | 'ativado' | 'desativado'
export async function estadoDoAparelho(store, lista) {
  const s = await suporte(store);
  if (s !== 'ok') return { estado: s };
  if (Notification.permission === 'denied') return { estado: 'bloqueado' };
  const sub = await inscricaoDoNavegador();
  const linha = sub && lista.find((l) => l.endpoint === sub.endpoint);
  return linha ? { estado: 'ativado', linha, endpoint: sub.endpoint } : { estado: 'desativado' };
}

export async function ativar(store) {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') {
    throw new Error(permissao === 'denied'
      ? 'O navegador bloqueou as notificações deste site. Libere nas configurações do navegador e tente de novo.'
      : 'É preciso permitir as notificações para ativar.');
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(await store.vapidPublica()) });
  const { endpoint, keys } = sub.toJSON();
  const existentes = await store.list(TABELA);
  // Inscrição antiga deste mesmo aparelho (que o navegador perdeu): sai da lista para não ficar repetida.
  const lembrado = await lembradoPeloOSW();
  const velha = lembrado?.endpoint && lembrado.endpoint !== endpoint && existentes.find((l) => l.endpoint === lembrado.endpoint);
  if (velha) await store.remove(TABELA, velha.id);
  if (!existentes.some((l) => l.endpoint === endpoint)) {
    await store.insert(TABELA, { endpoint, p256dh: keys.p256dh, auth: keys.auth, aparelho: nomeDoAparelho() });
  }
  await guardarParaOSW(store, endpoint);
  return endpoint;
}

export async function desativar(store) {
  const sub = await inscricaoDoNavegador();
  if (!sub) return;
  const linha = (await store.list(TABELA)).find((l) => l.endpoint === sub.endpoint);
  if (linha) await store.remove(TABELA, linha.id);
  await sub.unsubscribe();
  await esquecerParaOSW();
}

export async function remover(store, id) {
  await store.remove(TABELA, id);
}

// Pede à função uma notificação de teste só para este aparelho.
export async function enviarTeste(store, endpoint) {
  const token = await store.tokenDeAcesso();
  const url = await store.urlDaFuncao('lembretes');
  if (!token) throw new Error('Entre no app de novo para enviar o teste.');
  let resp;
  try {
    resp = await fetch(`${url}?teste=1`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }),
    });
  } catch {
    throw new Error('Não deu para falar com a função "lembretes". Confira se ela foi criada no Supabase.');
  }
  if (!resp.ok) {
    let corpo = {};
    try { corpo = await resp.json(); } catch { /* sem corpo */ }
    // 502: a função enviou, mas o serviço de push recusou — explica o porquê.
    if (resp.status === 502 && corpo.status !== undefined) throw new Error(explicarStatusDoPush(corpo.status));
    throw new Error(corpo.erro || `A função respondeu ${resp.status}.`);
  }
}

// A inscrição foi feita com outra chave pública (a chave do app mudou)? O serviço de push recusaria tudo.
function chaveDiferente(sub, chave) {
  const atual = sub?.options?.applicationServerKey;
  if (!atual || !chave) return false;
  const a = new Uint8Array(atual);
  const b = deB64u(chave);
  return a.length !== b.length || a.some((x, i) => x !== b[i]);
}

// Ao entrar no app: se o navegador trocou a inscrição deste aparelho (acontece de tempos em tempos)
// e ela não está gravada, grava de novo; se ela foi feita com uma chave antiga, refaz com a atual
// e troca a linha — senão os avisos param sem ninguém perceber.
export async function sincronizar(store) {
  if ((await suporte(store)) !== 'ok' || Notification.permission !== 'granted') return;
  let sub = await inscricaoDoNavegador();
  const existentes = await store.list(TABELA);
  const chave = await store.vapidPublica();
  if (!sub) {
    // O navegador (Android, principalmente) às vezes derruba a inscrição sem avisar. Se este aparelho já tinha
    // ativado os avisos e a permissão segue valendo, refaz a inscrição na hora e troca a linha antiga.
    const lembrado = await lembradoPeloOSW();
    if (!lembrado?.endpoint) return;
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(chave) });
    const velha = existentes.find((l) => l.endpoint === lembrado.endpoint);
    if (velha && velha.endpoint !== sub.endpoint) await store.remove(TABELA, velha.id);
  }
  if (chaveDiferente(sub, chave)) {
    const velha = existentes.find((l) => l.endpoint === sub.endpoint);
    await sub.unsubscribe();
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deB64u(chave) });
    if (velha) await store.remove(TABELA, velha.id);
  }
  const { endpoint, keys } = sub.toJSON();
  if (!existentes.some((l) => l.endpoint === endpoint)) {
    await store.insert(TABELA, { endpoint, p256dh: keys.p256dh, auth: keys.auth, aparelho: nomeDoAparelho() });
  }
  await guardarParaOSW(store, endpoint);
}

// Pergunta à função o que ela enxerga: chaves, banco, agendador e este aparelho.
// Devolve { http, dados } — `http` é o status da resposta (0 = não respondeu).
export async function diagnosticar(store, endpoint) {
  const token = await store.tokenDeAcesso();
  if (!token) throw new Error('Entre no app de novo para verificar.');
  let resp;
  try {
    resp = await fetch(`${await store.urlDaFuncao('lembretes')}?diagnostico=1`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: endpoint || '', vapidPublica: await store.vapidPublica() }),
    });
  } catch {
    return { http: 0, dados: null };
  }
  let dados = null;
  try { dados = await resp.json(); } catch { /* sem corpo */ }
  return { http: resp.status, dados };
}

// O que significa a resposta do serviço de push (Google, Mozilla, Apple) ao último envio.
export function explicarStatusDoPush(status) {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return `O serviço de push recusou o aviso (${status}): a chave da função não é a mesma com que este aparelho foi ativado. Toque em "Desativar neste aparelho" e depois em "Ativar neste aparelho".`;
  if (status === 400 || status === 413) return `O serviço de push recusou o aviso (${status}). Desative e ative este aparelho de novo.`;
  if (status === 0) return 'O último envio não chegou ao serviço de push (rede). A função tenta de novo no minuto seguinte.';
  return `O serviço de push respondeu ${status} no último envio; a função tenta de novo no minuto seguinte.`;
}
