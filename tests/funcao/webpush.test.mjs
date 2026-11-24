import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createPublicKey, verify, randomBytes } from 'node:crypto';
import ece from 'http_ece';
import { gerarChavesVapid, cabecalhosVapid, cifrar, enviarPush } from '../../supabase/functions/lembretes/webpush.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function aparelho() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { ecdh, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(randomBytes(16)) };
}

test('gerarChavesVapid: pública de 65 bytes (0x04…) e privada de 32 bytes, em base64url', async () => {
  const { publica, privada } = await gerarChavesVapid();
  const pub = Buffer.from(publica, 'base64url');
  assert.equal(pub.length, 65); assert.equal(pub[0], 4);
  assert.equal(Buffer.from(privada, 'base64url').length, 32);
});

test('cabecalhosVapid: JWT ES256 com aud da origem do endpoint, exp em até 24 h e assinatura válida', async () => {
  const { publica, privada } = await gerarChavesVapid();
  const agoraS = 1795400000;
  const { Authorization } = await cabecalhosVapid({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', publica, privada, assunto: 'mailto:a@b.c', agoraS });
  const [, t, k] = Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, publica);
  const [h, c, s] = t.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { typ: 'JWT', alg: 'ES256' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:a@b.c');
  assert.ok(claims.exp > agoraS && claims.exp <= agoraS + 86400);
  const pub = Buffer.from(publica, 'base64url');
  const chave = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: chave, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('cifrar: o aparelho decifra a mensagem (aes128gcm, RFC 8291)', async () => {
  const ua = aparelho();
  const texto = JSON.stringify({ titulo: 'Vocabulário', corpo: 'Começa às 21:30 (em 10 min)' });
  const cifrado = await cifrar({ p256dh: ua.p256dh, auth: ua.auth, texto });
  const claro = ece.decrypt(Buffer.from(cifrado), { version: 'aes128gcm', privateKey: ua.ecdh, authSecret: ua.auth });
  assert.equal(claro.toString('utf8'), texto);
});

test('enviarPush: POST cifrado com os cabeçalhos do protocolo e devolve o status', async () => {
  const ua = aparelho();
  const vapid = { ...(await gerarChavesVapid()), assunto: 'mailto:a@b.c' };
  let pedido;
  const fetch = async (url, init) => { pedido = { url, init }; return { status: 201 }; };
  const r = await enviarPush({ inscricao: { endpoint: 'https://push.exemplo/x', p256dh: ua.p256dh, auth: ua.auth }, payload: { titulo: 'Oi' }, vapid, fetch });
  assert.equal(r.status, 201);
  assert.equal(pedido.url, 'https://push.exemplo/x');
  assert.equal(pedido.init.method, 'POST');
  const h = pedido.init.headers;
  assert.equal(h['Content-Encoding'], 'aes128gcm');
  assert.equal(h.TTL, '600'); assert.equal(h.Urgency, 'high');
  assert.match(h.Authorization, /^vapid t=/);
  const claro = ece.decrypt(Buffer.from(pedido.init.body), { version: 'aes128gcm', privateKey: ua.ecdh, authSecret: ua.auth });
  assert.deepEqual(JSON.parse(claro), { titulo: 'Oi' });
});
