// Gera o par de chaves das notificações (VAPID). Uso, no terminal, dentro da pasta do projeto:
//   node scripts/gerar-chaves-vapid.mjs
// A pública vai no js/config.js e no segredo VAPID_PUBLIC_KEY; a privada SÓ no segredo VAPID_PRIVATE_KEY do Supabase.
import { gerarChavesVapid } from '../supabase/functions/lembretes/webpush.js';

const { publica, privada } = await gerarChavesVapid();
console.log(`Chave pública  (VAPID_PUBLIC_KEY):  ${publica}`);
console.log(`Chave privada  (VAPID_PRIVATE_KEY): ${privada}`);
console.log('Guarde a privada só no Supabase. Não cole em nenhum arquivo do projeto.');
