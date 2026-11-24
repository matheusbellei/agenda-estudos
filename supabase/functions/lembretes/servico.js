// Lógica da função "lembretes", sem nada do Deno: o banco, o envio e o relógio chegam de fora
// (entrada.js no Supabase; um banco falso nos testes).
//   POST  (cabeçalho x-lembretes-segredo)  → tique do agendador, a cada minuto
//   GET   ?acao=cumprir|adiar&t=<token>    → botões da notificação (o token prova quem pediu)
//   POST  ?teste=1 (Authorization: Bearer <sessão>) → notificação de teste para um aparelho
import { blocosDoPeriodo, ocorrenciasDeCompromissos } from '../../../js/regras/calendario.js';
import { devidos, agoraNoFuso, refDoBloco, revisaoVence, flashVence } from '../../../js/regras/lembretes.js';
import { paraHoje, textoDoAvisoFlash } from '../../../js/regras/flash.js';
import { semanaDaRevisao, textoDaRevisao } from '../../../js/regras/acompanhamento.js';
import { focoNoTique, proximaFase, iniciarFase } from '../../../js/regras/foco.js';
import { efeitosDeEstado } from '../../../js/regras/fila.js';
import { somaDias } from '../../../js/regras/datas.js';
import { paraB64u, deB64u } from './webpush.js';

export const PADROES = {
  notif_antes_min: 10, notif_resumo: true, notif_resumo_min: 420, notif_pendencias: true, notif_pendencias_min: 1290,
  notif_silencio: false, notif_silencio_de: 1320, notif_silencio_ate: 420, fuso: 'America/Sao_Paulo',
  sequencia_min: 30, revisao: true, revisao_dia: 7, revisao_min: 1200,
  foco_min: 25, pausa_min: 5, pausa_longa_min: 15, ciclos_longa: 4, foco_som: true,
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

  async function enviarParaAparelhos(aparelhos, payload) {
    for (const sub of aparelhos) {
      let status = 0;
      try { ({ status } = await enviar(sub, payload)); } catch { status = 0; }
      // 404/410: o navegador cancelou a inscrição; não adianta tentar de novo.
      if (status === 404 || status === 410) await banco.remove('push_subscriptions', { id: sub.id });
      else if (status >= 200 && status < 300) await banco.update('push_subscriptions', { id: sub.id }, { ultimo_ok: new Date(agora()).toISOString() });
    }
  }

  async function tique() {
    const inscricoes = await banco.select('push_subscriptions', {});
    const donos = [...new Set(inscricoes.map((s) => s.owner_id))];
    const focos = donos.length ? await banco.select('focos', { owner_id: { in: donos } }) : [];
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
      const revisao = revisaoVence({ instanteMs: agora(), fuso: ajustes.fuso, ajustes, enviadas });
      if (revisao) {
        // Só neste minuto a função lê a semana inteira e as tags.
        const agoraLocal = agoraNoFuso(agora(), ajustes.fuso);
        const segunda = semanaDaRevisao(agoraLocal, ajustes);
        const domingo = somaDias(segunda, 6);
        const [categories, semana] = await Promise.all([
          banco.select('categories', { owner_id: dono }),
          banco.select('blocks', { owner_id: dono, date: { gte: segunda, lte: domingo } }),
        ]);
        lista.push({ ...revisao, tipo: 'revisao', titulo: 'Revisão da semana', acoes: [], url: './?tela=revisao',
          corpo: textoDaRevisao({ categories, commitments, blocks: semana }, segunda, agoraLocal) });
      }
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
      // Modo foco: a fase que acabou vira aviso (uma vez) e a linha passa a "esperando".
      const foco = focos.find((f) => f.owner_id === dono);
      const fimDoFoco = focoNoTique({ foco, instanteMs: agora(), fuso: ajustes.fuso, ajustes, enviadas });
      if (fimDoFoco.aviso) {
        const { chave, titulo, corpo, botao } = fimDoFoco.aviso;
        lista.push({ chave, tipo: 'foco', titulo, corpo, acoes: ['proxima'], tituloAcao: botao, ref: 'foco', data: foco.termina_em, url: './?tela=foco' });
      }
      const aparelhos = inscricoes.filter((s) => s.owner_id === dono);
      for (const n of lista) {
        // Grava antes de enviar: se dois tiques rodarem juntos, só um consegue gravar e enviar.
        // A fase pode ter sido pausada, pulada ou parada desde a leitura do começo do tique.
        if (n.tipo === 'foco') {
          const [atual] = await banco.select('focos', { owner_id: dono });
          if (!atual || atual.estado !== 'rodando' || atual.termina_em !== foco.termina_em) continue;
        }
        const gravou = await banco.insert('notificacoes_enviadas', { owner_id: dono, chave: n.chave, enviada_em: new Date(agora()).toISOString() }, { ignorarConflito: true });
        if (!gravou.length) continue;
        await enviarParaAparelhos(aparelhos, await payloadDe(dono, n));
        total += 1;
      }
      if (fimDoFoco.esperando) {
        await banco.update('focos', { owner_id: dono, termina_em: foco.termina_em }, { estado: 'esperando', atualizado_em: new Date(agora()).toISOString() });
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
    const [cards, items] = await Promise.all([banco.select('cards', { owner_id: dono }), banco.select('items', { owner_id: dono })]);
    const { marcarItem } = efeitosDeEstado(bloco, 'done', { cards, items });
    if (bloco.virtual) {
      await banco.insert('blocks', {
        owner_id: dono, commitment_id: bloco.commitment_id, date: bloco.date, start_min: bloco.start_min, end_min: bloco.end_min,
        kind: bloco.kind, card_id: bloco.card_id || null, title: bloco.title, category_id: bloco.category_id || null,
        lembrete_min: bloco.lembrete_min ?? null, status: 'done', instead_note: '',
      });
    } else {
      await banco.update('blocks', { id: bloco.id, owner_id: dono }, { status: 'done' });
    }
    if (marcarItem) {
      try { await banco.update('items', { id: marcarItem.id, owner_id: dono }, { done: marcarItem.done }); } catch (err) {
        // Mesma regra do app: sem o item, o bloco volta a planejado.
        if (!bloco.virtual) await banco.update('blocks', { id: bloco.id, owner_id: dono }, { status: 'planned' });
        throw err;
      }
    }
    return { ok: true };
  }

  // "Começar pausa" / "Começar foco" na notificação: só vale para a fase que o aviso anunciou.
  async function proximaDoFoco(dono, terminaEm) {
    const [foco] = await banco.select('focos', { owner_id: dono });
    const mesma = foco && foco.termina_em && Date.parse(foco.termina_em) === Date.parse(terminaEm);
    if (!mesma || !['rodando', 'esperando'].includes(foco.estado)) return { ok: true, nada: true };
    const [linha] = await banco.select('settings', { owner_id: dono });
    const ajustes = { ...PADROES, ...Object.fromEntries(Object.entries(linha || {}).filter(([, v]) => v !== null && v !== undefined)) };
    const p = proximaFase(foco, ajustes);
    await banco.update('focos', { owner_id: dono, termina_em: foco.termina_em },
      { ...iniciarFase(p.fase, p.ciclo, agora(), ajustes), atualizado_em: new Date(agora()).toISOString() });
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
    if (pedida === 'proxima') return resposta(req, 200, await proximaDoFoco(t.dono, t.data));
    return resposta(req, 400, { erro: 'Ação desconhecida.' });
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
    return resposta(req, status >= 200 && status < 300 ? 200 : 502, { status });
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
      if (req.method === 'POST') {
        if (req.headers.get('x-lembretes-segredo') !== env.LEMBRETES_SEGREDO || !env.LEMBRETES_SEGREDO) return resposta(req, 401, { erro: 'Sem permissão.' });
        return resposta(req, 200, await tique());
      }
      return resposta(req, 404, { erro: 'Não encontrado.' });
    } catch (err) {
      return resposta(req, 500, { erro: String(err?.message || err) });
    }
  }

  return { tratar, tique };
}
