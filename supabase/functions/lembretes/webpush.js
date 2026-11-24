// Web Push sem dependências: assinatura VAPID (RFC 8292, ES256) e cifra aes128gcm (RFC 8291 + RFC 8188),
// só com a Web Crypto padrão — roda igual no Deno (Edge Function do Supabase) e no Node (testes).
const sutil = globalThis.crypto.subtle;
const enc = new TextEncoder();

export function paraB64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64u(texto) {
  const s = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

const juntar = (...partes) => {
  const saida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { saida.set(p, i); i += p.length; }
  return saida;
};

async function hmac(chave, dados) {
  const k = await sutil.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await sutil.sign('HMAC', k, dados));
}

// HKDF de um bloco (basta: as saídas aqui têm até 32 bytes).
async function hkdf(sal, ikm, info, tamanho) {
  const prk = await hmac(sal, ikm);
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tamanho);
}

export async function gerarChavesVapid() {
  const par = await sutil.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await sutil.exportKey('jwk', par.privateKey);
  return { publica: paraB64u(juntar(new Uint8Array([4]), deB64u(jwk.x), deB64u(jwk.y))), privada: jwk.d };
}

async function chavePrivadaVapid(publica, privada) {
  const pub = deB64u(publica);
  return sutil.importKey('jwk', {
    kty: 'EC', crv: 'P-256', d: privada, x: paraB64u(pub.slice(1, 33)), y: paraB64u(pub.slice(33, 65)), ext: true,
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// Cabeçalho Authorization do VAPID: JWT assinado para a origem do serviço de push, válido por 12 h.
export async function cabecalhosVapid({ endpoint, publica, privada, assunto, agoraS = Math.floor(Date.now() / 1000) }) {
  const cab = paraB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = paraB64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: agoraS + 12 * 3600, sub: assunto })));
  const chave = await chavePrivadaVapid(publica, privada);
  const assinatura = await sutil.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, enc.encode(`${cab}.${corpo}`));
  return { Authorization: `vapid t=${cab}.${corpo}.${paraB64u(assinatura)}, k=${publica}` };
}

// Cifra `texto` para o aparelho (chave p256dh e segredo auth da inscrição), num registro único.
export async function cifrar({ p256dh, auth, texto }) {
  const uaPublica = deB64u(p256dh);
  const segredo = deB64u(auth);
  const efemera = await sutil.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublica = new Uint8Array(await sutil.exportKey('raw', efemera.publicKey));
  const uaChave = await sutil.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartilhado = new Uint8Array(await sutil.deriveBits({ name: 'ECDH', public: uaChave }, efemera.privateKey, 256));

  const ikm = await hkdf(segredo, compartilhado, juntar(enc.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const chave = await sutil.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const claro = juntar(enc.encode(texto), new Uint8Array([2])); // 0x02 = último registro
  const cifrado = new Uint8Array(await sutil.encrypt({ name: 'AES-GCM', iv: nonce }, chave, claro));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return juntar(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

// Envia `payload` (objeto, vira JSON) para uma inscrição. Devolve o status do serviço de push
// (201 = aceito; 404/410 = inscrição que não existe mais).
export async function enviarPush({ inscricao, payload, vapid, fetch = globalThis.fetch, ttl = 600, urgencia = 'high' }) {
  const corpo = await cifrar({ p256dh: inscricao.p256dh, auth: inscricao.auth, texto: JSON.stringify(payload) });
  const { Authorization } = await cabecalhosVapid({ endpoint: inscricao.endpoint, publica: vapid.publica, privada: vapid.privada, assunto: vapid.assunto });
  const resp = await fetch(inscricao.endpoint, {
    method: 'POST',
    headers: { Authorization, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: urgencia },
    body: corpo,
  });
  return { status: resp.status };
}
