// Notificações neste aparelho: pedir permissão, inscrever no push do navegador e guardar a inscrição
// (push_subscriptions) para a função "lembretes" do Supabase saber para onde mandar.
const TABELA = 'push_subscriptions';

function deB64u(texto) {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
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
  if (!existentes.some((l) => l.endpoint === endpoint)) {
    await store.insert(TABELA, { endpoint, p256dh: keys.p256dh, auth: keys.auth, aparelho: nomeDoAparelho() });
  }
  return endpoint;
}

export async function desativar(store) {
  const sub = await inscricaoDoNavegador();
  if (!sub) return;
  const linha = (await store.list(TABELA)).find((l) => l.endpoint === sub.endpoint);
  if (linha) await store.remove(TABELA, linha.id);
  await sub.unsubscribe();
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
    let msg = '';
    try { msg = (await resp.json()).erro || ''; } catch { /* sem corpo */ }
    throw new Error(msg || `A função respondeu ${resp.status}.`);
  }
}

// Ao entrar no app: se o navegador trocou a inscrição deste aparelho (acontece de tempos em tempos)
// e ela não está gravada, grava de novo — senão os avisos param sem ninguém perceber.
export async function sincronizar(store) {
  if ((await suporte(store)) !== 'ok' || Notification.permission !== 'granted') return;
  const sub = await inscricaoDoNavegador();
  if (!sub) return;
  const { endpoint, keys } = sub.toJSON();
  const existentes = await store.list(TABELA);
  if (existentes.some((l) => l.endpoint === endpoint)) return;
  await store.insert(TABELA, { endpoint, p256dh: keys.p256dh, auth: keys.auth, aparelho: nomeDoAparelho() });
}
