// Lógica da função "lembretes", sem nada do Deno: o banco, o envio e o relógio chegam de fora
// (entrada.js no Supabase; um banco falso nos testes).
//   POST  (cabeçalho x-lembretes-segredo)  → tique do agendador, a cada minuto
//   GET   ?acao=cumprir|adiar&t=<token>    → botões da notificação (o token prova quem pediu)
//   POST  ?teste=1 (Authorization: Bearer <sessão>) → notificação de teste para um aparelho
import { blocosDoPeriodo, ocorrenciasDeCompromissos } from '../../../js/regras/calendario.js';
import { devidos, agoraNoFuso, refDoBloco, flashVence } from '../../../js/regras/lembretes.js';
import { paraHoje, textoDoAvisoFlash } from '../../../js/regras/flash.js';
import { somaDias } from '../../../js/regras/datas.js';
import { paraB64u, deB64u } from './webpush.js';

export const PADROES = {
  notif_antes_min: 10, notif_resumo: true, notif_resumo_min: 420, notif_pendencias: true, notif_pendencias_min: 1290,
  notif_silencio: false, notif_silencio_de: 1320, notif_silencio_ate: 420, fuso: 'America/Sao_Paulo',
  sequencia_min: 30, revisao: true, revisao_dia: 7, revisao_min: 1200,
  revisoes_dias: [7, 30], modelos_com_fixas: false,
  flash_card_novos_dia: 20, flash_card_revisoes_dia: 200, flash_card_fator: 2.5, flash_aviso: true, flash_aviso_min: 1140,
};
const ORIGENS = [/^https:\/\/matheusbellei\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const TITULO_ACAO = { cumprir: 'Cumprido', adiar: 'Adiar 10 min', proxima: 'Próxima fase' };
const VALIDADE_TOKEN_S = 24 * 3600;
const ADIAR_MS = 10 * 60000;
const GUARDAR_ENVIADAS_MS = 14 * 86400000;
const enc = new TextEncoder();

async function hmac(segredo, texto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}

// Token da ação: "<dados>.<assinatura>" em base64url; dados = dono|ref|data|acao|expira (epoch s).
export async function assinarToken(segredo, { dono, ref, data, acao, expira }) {
  const dados = [dono, ref, data, acao, expira].join('|');
  return `${paraB64u(enc.encode(dados))}.${paraB64u(await hmac(segredo, dados))}`;
}

async function lerToken(segredo, token) {
  const [d, a] = String(token || '').split('.');
  if (!d || !a) return null;
  let dados;
  try { dados = new TextDecoder().decode(deB64u(d)); } catch { return null; }
  const certa = paraB64u(await hmac(segredo, dados));
  if (certa.length !== a.length) return null;
  let dif = 0;
  for (let i = 0; i < certa.length; i++) dif |= certa.charCodeAt(i) ^ a.charCodeAt(i);
  if (dif) return null;
  const [dono, ref, data, acao, expira] = dados.split('|');
  return { dono, ref, data, acao, expira: Number(expira) };
}

function cabecalhosCors(req) {
  const origem = req.headers.get('origin') || '';
  const h = { 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' };
  if (ORIGENS.some((re) => re.test(origem))) h['Access-Control-Allow-Origin'] = origem;
  return h;
}

export function criarServico({ banco, enviar, agora = () => Date.now(), env }) {
  const urlDaFuncao = `${env.SUPABASE_URL}/functions/v1/lembretes`;

  async function payloadDe(dono, n) {
    const expira = Math.floor(agora() / 1000) + VALIDADE_TOKEN_S;
    const acoes = [];
    for (const acao of n.acoes) {
      const t = await assinarToken(env.LEMBRETES_SEGREDO, { dono, ref: n.ref, data: n.data, acao, expira });
      acoes.push({ acao, titulo: n.tituloAcao || TITULO_ACAO[acao], url: `${urlDaFuncao}?acao=${acao}&t=${encodeURIComponent(t)}` });
    }
    const url = n.url || (n.ref ? `./?bloco=${encodeURIComponent(n.ref)}&data=${n.data}` : `./?data=${n.data}`);
    return { titulo: n.titulo, corpo: n.corpo, tag: n.chave, url, acoes };
  }

  // Devolve quantos aparelhos aceitaram e quantos falharam por algo passageiro (rede, 429, 5xx).
  // O status de cada tentativa fica na inscrição (o diagnóstico do app mostra).
  async function enviarParaAparelhos(aparelhos, payload) {
    let aceitos = 0; let passageiras = 0;
    for (const sub of aparelhos) {
      let status = 0;
      try { ({ status } = await enviar(sub, payload)); } catch { status = 0; }
      // 404/410: o navegador cancelou a inscrição; não adianta tentar de novo.
      if (status === 404 || status === 410) { await banco.remove('push_subscriptions', { id: sub.id }); continue; }
      const ok = status >= 200 && status < 300;
      if (ok) aceitos += 1;
      else if (status === 0 || status === 429 || status >= 500) passageiras += 1;
      try {
        await banco.update('push_subscriptions', { id: sub.id }, { ultimo_status: status, ...(ok ? { ultimo_ok: new Date(agora()).toISOString() } : {}) });
      } catch { /* registro opcional: não impede o envio */ }
    }
    return { aceitos, passageiras };
  }

  async function tique() {
    const inscricoes = await banco.select('push_subscriptions', {});
    const donos = [...new Set(inscricoes.map((s) => s.owner_id))];
    let total = 0;
    for (const dono of donos) {
      const [linha] = await banco.select('settings', { owner_id: dono });
      const ajustes = { ...PADROES, ...Object.fromEntries(Object.entries(linha || {}).filter(([, v]) => v !== null && v !== undefined)) };
      const { data: hoje } = agoraNoFuso(agora(), ajustes.fuso);
      const amanha = somaDias(hoje, 1);
      const [commitments, blocks, adiamentos, enviadasLinhas] = await Promise.all([
        banco.select('commitments', { owner_id: dono }),
        banco.select('blocks', { owner_id: dono, date: { in: [hoje, amanha] } }),
        banco.select('adiamentos', { owner_id: dono }),
        banco.select('notificacoes_enviadas', { owner_id: dono }),
      ]);
      const lista = devidos({
        instanteMs: agora(), fuso: ajustes.fuso, ajustes, adiamentos,
        blocos: blocosDoPeriodo(commitments, blocks, hoje, amanha),
        enviadas: new Set(enviadasLinhas.map((e) => e.chave)),
      });
      const enviadas = new Set(enviadasLinhas.map((e) => e.chave));
      // Flashcards do dia: só neste minuto a função lê baralhos, flashcards e lados.
      const avisoFlash = flashVence({ instanteMs: agora(), fuso: ajustes.fuso, ajustes, enviadas });
      if (avisoFlash) {
        const [baralhos, cards, flashcards, flash_lados] = await Promise.all([
          banco.select('baralhos', { owner_id: dono }), banco.select('cards', { owner_id: dono }),
          banco.select('flashcards', { owner_id: dono }), banco.select('flash_lados', { owner_id: dono }),
        ]);
        const { total } = paraHoje({ baralhos, cards, flashcards, flash_lados }, avisoFlash.data, ajustes);
        if (total > 0) lista.push({ ...avisoFlash, tipo: 'flash', titulo: 'Flashcards', corpo: textoDoAvisoFlash(total), acoes: [], url: './?tela=flashcards' });
      }
      const aparelhos = inscricoes.filter((s) => s.owner_id === dono);
      for (const n of lista) {
        // Grava antes de enviar: se dois tiques rodarem juntos, só um consegue gravar e enviar.
        const gravou = await banco.insert('notificacoes_enviadas', { owner_id: dono, chave: n.chave, enviada_em: new Date(agora()).toISOString() }, { ignorarConflito: true });
        if (!gravou.length) continue;
        const { aceitos, passageiras } = await enviarParaAparelhos(aparelhos, await payloadDe(dono, n));
        // Ninguém recebeu por falha passageira: apaga o registro para o próximo minuto tentar de novo
        // (dentro da tolerância do lembrete).
        if (!aceitos && passageiras) await banco.remove('notificacoes_enviadas', { owner_id: dono, chave: n.chave });
        total += 1;
      }
    }
    await banco.remove('notificacoes_enviadas', { enviada_em: { lt: new Date(agora() - GUARDAR_ENVIADAS_MS).toISOString() } });
    await banco.remove('adiamentos', { quando: { lt: new Date(agora() - 3600000).toISOString() } });
    return { enviadas: total };
  }

  // O bloco a que a ação se refere: gravado (por id) ou a ocorrência da fixa naquela data.
  async function acharBloco(dono, ref, data) {
    if (!ref.startsWith('v:')) return (await banco.select('blocks', { id: ref, owner_id: dono }))[0] || null;
    const fixa = ref.slice(2);
    const gravado = (await banco.select('blocks', { owner_id: dono, commitment_id: fixa, date: data }))[0];
    if (gravado) return gravado;
    const [c] = await banco.select('commitments', { id: fixa, owner_id: dono });
    return c ? ocorrenciasDeCompromissos([c], data, data)[0] || null : null;
  }

  async function cumprir(dono, ref, data) {
    const bloco = await acharBloco(dono, ref, data);
    if (!bloco || bloco.cancelled || bloco.status !== 'planned') return { ok: true, nada: true };
    if (bloco.virtual) {
      await banco.insert('blocks', {
        owner_id: dono, commitment_id: bloco.commitment_id, date: bloco.date, start_min: bloco.start_min, end_min: bloco.end_min,
        kind: bloco.kind, card_id: bloco.card_id || null, baralho_id: bloco.baralho_id || null, title: bloco.title, category_id: bloco.category_id || null,
        lembrete_min: bloco.lembrete_min ?? null, status: 'done', instead_note: '',
      });
    } else {
      await banco.update('blocks', { id: bloco.id, owner_id: dono }, { status: 'done' });
    }
    return { ok: true };
  }

  async function acao(req, url) {
    const pedida = url.searchParams.get('acao');
    const t = await lerToken(env.LEMBRETES_SEGREDO, url.searchParams.get('t'));
    if (!t || t.acao !== pedida || !(t.expira > agora() / 1000)) return resposta(req, 403, { erro: 'Link vencido ou inválido.' });
    if (pedida === 'cumprir') return resposta(req, 200, await cumprir(t.dono, t.ref, t.data));
    if (pedida === 'adiar') {
      await banco.insert('adiamentos', { owner_id: t.dono, ref: t.ref, data: t.data, quando: new Date(agora() + ADIAR_MS).toISOString() });
      return resposta(req, 200, { ok: true });
    }
    return resposta(req, 400, { erro: 'Ação desconhecida.' });
  }

  // Registro do agendador (uma linha só): quando rodou por último e o último erro.
  async function registrarTique(campos) {
    try { await banco.salvar('lembretes_status', { id: 1, ...campos }); } catch { /* sem a tabela ainda: segue */ }
  }

  // Diagnóstico para a tela de Notificações: o que a função enxerga (sem revelar segredo nenhum).
  async function diagnostico(req) {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuario = jwt ? await banco.usuarioDoJwt(jwt) : null;
    if (!usuario) return resposta(req, 401, { erro: 'Entre no app de novo.' });
    let corpo = {};
    try { corpo = await req.json(); } catch { /* sem corpo */ }
    const chaves = {
      publica: Boolean(env.VAPID_PUBLIC_KEY),
      publicaIgual: Boolean(env.VAPID_PUBLIC_KEY) && corpo.vapidPublica === env.VAPID_PUBLIC_KEY,
      privada: Boolean(env.VAPID_PRIVADA_OK),
      segredo: Boolean(env.LEMBRETES_SEGREDO),
    };
    let bancoOk = 'ok'; let status = null; let sub = null;
    try {
      [sub] = await banco.select('push_subscriptions', { owner_id: usuario.id, endpoint: corpo.endpoint || '' });
      try { [status] = await banco.select('lembretes_status', { id: 1 }); } catch { status = null; }
    } catch (err) { bancoOk = String(err?.message || err); }
    const ultimo = status?.ultimo_tique ? Date.parse(status.ultimo_tique) : null;
    return resposta(req, 200, {
      chaves, banco: bancoOk,
      agendador: {
        ultimoTique: status?.ultimo_tique || null,
        segundosDesdeUltimo: ultimo ? Math.round((agora() - ultimo) / 1000) : null,
        ultimoErro: status?.ultimo_erro || null, erroEm: status?.erro_em || null,
      },
      aparelho: { ativado: Boolean(sub), ultimoOk: sub?.ultimo_ok || null, ultimoStatus: sub?.ultimo_status ?? null },
    });
  }

  async function teste(req) {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const usuario = jwt ? await banco.usuarioDoJwt(jwt) : null;
    if (!usuario) return resposta(req, 401, { erro: 'Entre no app de novo.' });
    let corpo = {};
    try { corpo = await req.json(); } catch { /* sem corpo */ }
    const [sub] = await banco.select('push_subscriptions', { owner_id: usuario.id, endpoint: corpo.endpoint || '' });
    if (!sub) return resposta(req, 404, { erro: 'Este aparelho não está ativado.' });
    const { status } = await enviar(sub, { titulo: 'Teste', corpo: 'As notificações da Agenda de Estudos estão funcionando.', tag: 'teste', url: './', acoes: [] });
    const ok = status >= 200 && status < 300;
    try {
      await banco.update('push_subscriptions', { id: sub.id }, { ultimo_status: status, ...(ok ? { ultimo_ok: new Date(agora()).toISOString() } : {}) });
    } catch { /* registro opcional */ }
    return resposta(req, ok ? 200 : 502, { status });
  }

  // O navegador renovou a inscrição com o app fechado: o service worker avisa o endereço antigo e o novo.
  // Sem login (o app não está aberto); quem sabe o endereço antigo — que só o aparelho e o banco conhecem — pode trocá-lo.
  async function trocar(req) {
    let corpo = {};
    try { corpo = await req.json(); } catch { /* sem corpo */ }
    const { antigo, novo } = corpo || {};
    const https = (x) => typeof x === 'string' && /^https:\/\/\S+$/.test(x);
    if (!https(antigo) || !novo || !https(novo.endpoint) || !novo.p256dh || !novo.auth) return resposta(req, 400, { erro: 'Dados incompletos.' });
    const [sub] = await banco.select('push_subscriptions', { endpoint: antigo });
    if (!sub) return resposta(req, 404, { erro: 'Aparelho não encontrado.' });
    const [ja] = await banco.select('push_subscriptions', { endpoint: novo.endpoint });
    if (ja) await banco.remove('push_subscriptions', { id: sub.id });
    else await banco.update('push_subscriptions', { id: sub.id }, { endpoint: novo.endpoint, p256dh: novo.p256dh, auth: novo.auth, ultimo_status: null });
    return resposta(req, 200, { ok: true });
  }

  function resposta(req, status, corpo) {
    return new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { ...cabecalhosCors(req), 'Content-Type': 'application/json' } });
  }

  async function tratar(req) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabecalhosCors(req) });
    try {
      if (req.method === 'GET' && url.searchParams.has('acao')) return await acao(req, url);
      if (req.method === 'POST' && url.searchParams.get('teste') === '1') return await teste(req);
      if (req.method === 'POST' && url.searchParams.get('diagnostico') === '1') return await diagnostico(req);
      if (req.method === 'POST' && url.searchParams.get('trocar') === '1') return await trocar(req);
      if (req.method === 'POST') {
        if (req.headers.get('x-lembretes-segredo') !== env.LEMBRETES_SEGREDO || !env.LEMBRETES_SEGREDO) return resposta(req, 401, { erro: 'Sem permissão.' });
        const instante = new Date(agora()).toISOString();
        try {
          const r = await tique();
          await registrarTique({ ultimo_tique: instante, ultimo_erro: null });
          return resposta(req, 200, r);
        } catch (err) {
          await registrarTique({ ultimo_erro: String(err?.message || err).slice(0, 500), erro_em: instante });
          throw err;
        }
      }
      return resposta(req, 404, { erro: 'Não encontrado.' });
    } catch (err) {
      return resposta(req, 500, { erro: String(err?.message || err) });
    }
  }

  return { tratar, tique };
}
