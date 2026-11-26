// Arquivo gerado por scripts/gerar-funcao.mjs a partir de supabase/functions/lembretes/*.js e js/regras/*.js.
// Para mudar, edite os arquivos de origem e rode: npm run gerar-funcao
// @ts-nocheck
// js/regras/datas.js
var doisDigitos = (n) => String(n).padStart(2, "0");
function isoDe(date) {
  return `${date.getFullYear()}-${doisDigitos(date.getMonth() + 1)}-${doisDigitos(date.getDate())}`;
}
function dataDe(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d, 12);
}
function somaDias(iso, n) {
  const d = dataDe(iso);
  d.setDate(d.getDate() + n);
  return isoDe(d);
}
function diaDaSemana(iso) {
  const dia = dataDe(iso).getDay();
  return dia === 0 ? 7 : dia;
}
function inicioDaSemana(iso) {
  return somaDias(iso, 1 - diaDaSemana(iso));
}
function horaTexto(min) {
  return `${doisDigitos(Math.floor(min / 60))}:${doisDigitos(min % 60)}`;
}

// js/regras/calendario.js
function ocorrenciasDeCompromissos(commitments, de, ate) {
  const saida = [];
  for (const c of commitments) {
    for (let dia = de; dia <= ate; dia = somaDias(dia, 1)) {
      if (dia < c.valid_from) continue;
      if (c.valid_to && dia > c.valid_to) continue;
      if (!c.days.includes(diaDaSemana(dia))) continue;
      saida.push({
        virtual: true,
        commitment_id: c.id,
        date: dia,
        start_min: c.start_min,
        end_min: c.end_min,
        // Sem separação estudo/compromisso na tela: com card é estudo (conta no progresso do card).
        kind: c.card_id ? "study" : "commitment",
        card_id: c.card_id || null,
        lembrete_min: c.lembrete_min ?? null,
        title: c.title,
        category_id: c.category_id,
        status: "planned",
        instead_note: ""
      });
    }
  }
  return saida;
}
function blocosDoPeriodo(commitments, blocks, de, ate) {
  const noPeriodo = blocks.filter((b) => b.date >= de && b.date <= ate);
  const gravados = new Set(noPeriodo.filter((b) => b.commitment_id).map((b) => `${b.commitment_id}|${b.date}`));
  const virtuais = ocorrenciasDeCompromissos(commitments, de, ate).filter((v) => !gravados.has(`${v.commitment_id}|${v.date}`));
  return [...noPeriodo.filter((b) => !b.cancelled), ...virtuais].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.start_min - b.start_min);
}

// js/regras/lembretes.js
var TOLERANCIA_MIN = 5;
var MAX_ITENS_RESUMO = 4;
function agoraNoFuso(instanteMs, fuso) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(instanteMs)).map((p) => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, minuto: Number(partes.hour) * 60 + Number(partes.minute) };
}
function emSilencio(minuto, ajustes) {
  if (!ajustes.notif_silencio) return false;
  const de = ajustes.notif_silencio_de;
  const ate = ajustes.notif_silencio_ate;
  return de <= ate ? minuto >= de && minuto < ate : minuto >= de || minuto < ate;
}
function refDoBloco(b) {
  return b.virtual ? `v:${b.commitment_id}` : b.id;
}
var vence = (alvo, minuto) => alvo <= minuto && alvo > minuto - TOLERANCIA_MIN;
var titulo = (b) => b.title || "Bloco";
var porInicio = (a, b) => a.start_min - b.start_min;
function devidos({ instanteMs, fuso, ajustes, blocos, adiamentos = [], enviadas = /* @__PURE__ */ new Set() }) {
  const { data: hoje, minuto } = agoraNoFuso(instanteMs, fuso);
  const saida = [];
  const pode = (chave, alvo) => !enviadas.has(chave) && !emSilencio((alvo % 1440 + 1440) % 1440, ajustes);
  const planejados = blocos.filter((b) => b.status === "planned");
  for (const b of planejados) {
    const antes = b.lembrete_min ?? ajustes.notif_antes_min;
    if (antes == null || antes < 0) continue;
    const base2 = b.date === hoje ? 0 : b.date > hoje ? 1440 : -1440;
    const alvo = base2 + b.start_min - antes;
    const chave = `antes:${refDoBloco(b)}:${b.date}:${b.start_min}`;
    if (!vence(alvo, minuto) || !pode(chave, alvo)) continue;
    const falta = base2 + b.start_min - minuto;
    saida.push({
      chave,
      tipo: "antes",
      titulo: titulo(b),
      ref: refDoBloco(b),
      data: b.date,
      acoes: ["cumprir", "adiar"],
      corpo: falta > 0 ? `Começa às ${horaTexto(b.start_min)} (em ${falta} min)` : falta === 0 ? "Começa agora" : `Começou às ${horaTexto(b.start_min)}`
    });
  }
  for (const a of adiamentos) {
    const quando = Date.parse(a.quando);
    if (!(quando <= instanteMs && quando > instanteMs - TOLERANCIA_MIN * 6e4)) continue;
    const b = planejados.find((x) => refDoBloco(x) === a.ref && x.date === a.data);
    const chave = `adiado:${a.ref}:${a.data}:${a.quando}`;
    if (!b || !pode(chave, minuto)) continue;
    saida.push({
      chave,
      tipo: "adiado",
      titulo: titulo(b),
      ref: a.ref,
      data: a.data,
      acoes: ["cumprir", "adiar"],
      corpo: `Começa às ${horaTexto(b.start_min)} (lembrete adiado)`
    });
  }
  const doDia = blocos.filter((b) => b.date === hoje).sort(porInicio);
  if (ajustes.notif_resumo && doDia.length && vence(ajustes.notif_resumo_min, minuto) && pode(`resumo:${hoje}`, ajustes.notif_resumo_min)) {
    const itens = doDia.slice(0, MAX_ITENS_RESUMO).map((b) => `${horaTexto(b.start_min)} ${titulo(b)}`).join(" · ");
    const resto = doDia.length - MAX_ITENS_RESUMO;
    saida.push({ chave: `resumo:${hoje}`, tipo: "resumo", titulo: "Hoje", data: hoje, acoes: [], corpo: resto > 0 ? `${itens} e mais ${resto}` : itens });
  }
  const pendentes = doDia.filter((b) => b.status === "planned" && b.end_min <= minuto);
  if (ajustes.notif_pendencias && pendentes.length && vence(ajustes.notif_pendencias_min, minuto) && pode(`pendencias:${hoje}`, ajustes.notif_pendencias_min)) {
    const n = pendentes.length;
    saida.push({
      chave: `pendencias:${hoje}`,
      tipo: "pendencias",
      titulo: "Faltou marcar",
      data: hoje,
      acoes: [],
      corpo: `${n} ${n === 1 ? "bloco" : "blocos"} de hoje sem marcar: ${pendentes.map(titulo).join(", ")}`
    });
  }
  return saida;
}
function revisaoVence({ instanteMs, fuso, ajustes, enviadas = /* @__PURE__ */ new Set() }) {
  if (!ajustes.revisao) return null;
  const { data, minuto } = agoraNoFuso(instanteMs, fuso);
  const chave = `revisao:${data}`;
  if (diaDaSemana(data) !== ajustes.revisao_dia || !vence(ajustes.revisao_min, minuto)) return null;
  if (enviadas.has(chave) || emSilencio(ajustes.revisao_min, ajustes)) return null;
  return { chave, data };
}
function flashVence({ instanteMs, fuso, ajustes, enviadas = /* @__PURE__ */ new Set() }) {
  if (!ajustes.flash_aviso) return null;
  const { data, minuto } = agoraNoFuso(instanteMs, fuso);
  const chave = `flash:${data}`;
  if (!vence(ajustes.flash_aviso_min, minuto) || enviadas.has(chave) || emSilencio(ajustes.flash_aviso_min, ajustes)) return null;
  return { chave, data };
}

// js/regras/baralhos.js
function paiValido(baralhos, b) {
  const pai = b.pai_id && baralhos.find((x) => x.id === b.pai_id);
  return pai && pai.e_grupo && pai.id !== b.id ? pai.id : null;
}
function grupoQueDefineLimites(baralhos, baralhoId) {
  let atual = baralhos.find((b) => b.id === baralhoId);
  let achado = null;
  const vistos = /* @__PURE__ */ new Set();
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id);
    const paiId = paiValido(baralhos, atual);
    atual = paiId ? baralhos.find((b) => b.id === paiId) : null;
    if (atual?.limites_do_grupo) achado = atual;
  }
  return achado;
}

// js/regras/flash.js
function ladosDoTipo(tipo) {
  return tipo === "invertido" ? ["frente", "verso"] : ["frente"];
}
function limitesDe(flashcard, { baralhos, ajustes }) {
  if (flashcard.baralho_id) {
    const b = baralhos.find((x) => x.id === flashcard.baralho_id) || {};
    const g = grupoQueDefineLimites(baralhos, flashcard.baralho_id) || b;
    return { novos: g.novos_dia ?? 20, revisoes: g.revisoes_dia ?? 200, fator: Number(b.fator ?? 2.5) };
  }
  return { novos: ajustes.flash_card_novos_dia, revisoes: ajustes.flash_card_revisoes_dia, fator: Number(ajustes.flash_card_fator) };
}
var porCriacao = (a, b) => String(a.flashcard.criado_em || "").localeCompare(String(b.flashcard.criado_em || ""));
function filaDaSessao({ flashcards, lados, hoje, limites }) {
  const daqui = new Set(flashcards.map((f) => f.id));
  const meus = lados.filter((l) => daqui.has(l.flashcard_id));
  const novosHoje = meus.filter((l) => l.introduzido_em === hoje).length;
  const revisadosHoje = meus.filter((l) => l.revisado_em === hoje && l.introduzido_em !== hoje).length;
  const revisoes = [];
  const novos = [];
  const errados = [];
  for (const flashcard of flashcards) {
    for (const nome of ladosDoTipo(flashcard.tipo)) {
      const l = meus.find((x) => x.flashcard_id === flashcard.id && x.lado === nome);
      const item = { flashcard, lado: nome, registro: l || null };
      if (!l || !l.vence && !l.introduzido_em) novos.push(item);
      else if (l.vence && l.vence <= hoje) (l.errado_em === hoje ? errados : revisoes).push(item);
    }
  }
  revisoes.sort((a, b) => a.registro.vence.localeCompare(b.registro.vence) || porCriacao(a, b));
  novos.sort(porCriacao);
  return [
    ...revisoes.slice(0, Math.max(0, limites.revisoes - revisadosHoje)),
    ...novos.slice(0, Math.max(0, limites.novos - novosHoje)),
    ...errados
  ];
}
function paraHoje({ baralhos = [], cards = [], flashcards = [], flash_lados: lados = [] }, hoje, ajustes) {
  const grupos = /* @__PURE__ */ new Map();
  const arquivados = new Set(cards.filter((c) => c.archived).map((c) => c.id));
  for (const f of flashcards) {
    if (f.card_id && arquivados.has(f.card_id)) continue;
    const chave = f.baralho_id ? `b:${f.baralho_id}` : `c:${f.card_id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(f);
  }
  const porBaralho = /* @__PURE__ */ new Map();
  const porCard = /* @__PURE__ */ new Map();
  let total = 0;
  for (const [chave, lista] of grupos) {
    const fila = filaDaSessao({ flashcards: lista, lados, hoje, limites: limitesDe(lista[0], { baralhos, ajustes }) });
    const novos = fila.filter((x) => !x.registro || !x.registro.vence && !x.registro.introduzido_em).length;
    const contagem = { novos, revisar: fila.length - novos };
    (chave.startsWith("b:") ? porBaralho : porCard).set(chave.slice(2), contagem);
    total += fila.length;
  }
  return { total, porBaralho, porCard };
}
function textoDoAvisoFlash(n) {
  return `Você tem ${n} ${n === 1 ? "flashcard" : "flashcards"} para hoje.`;
}

// js/regras/acompanhamento.js
var duracao = (b) => b.end_min - b.start_min;
var doisDigitos2 = (n) => String(n).padStart(2, "0");
function tagsDeEstudo(categories) {
  const marcadas = new Set(categories.filter((c) => c.conta_estudo).map((c) => c.id));
  return new Set(categories.filter((c) => marcadas.has(c.id) || c.parent_id && marcadas.has(c.parent_id)).map((c) => c.id));
}
function blocosDeEstudo(blocos, estudo) {
  return blocos.filter((b) => !b.cancelled && b.category_id && estudo.has(b.category_id));
}
var terminou = (b, agora) => b.date < agora.data || b.date === agora.data && b.end_min <= agora.minuto;
function situacao(b, agora) {
  if (b.status === "done") return "cumprido";
  if (b.status === "missed") return "nao_feito";
  return terminou(b, agora) ? "sem_marcar" : "futuro";
}
function resumo(blocosEstudo, agora) {
  const r = { planejado_min: 0, cumprido_min: 0, cumpridos: 0, nao_feitos: 0, nao_feito_min: 0, pct: null };
  for (const b of blocosEstudo) {
    r.planejado_min += duracao(b);
    const s = situacao(b, agora);
    if (s === "cumprido") {
      r.cumpridos += 1;
      r.cumprido_min += duracao(b);
    } else if (s !== "futuro") {
      r.nao_feitos += 1;
      r.nao_feito_min += duracao(b);
    }
  }
  const terminados = r.cumpridos + r.nao_feitos;
  r.pct = terminados ? Math.round(r.cumpridos * 100 / terminados) : null;
  return r;
}
function semanaDaRevisao(agora, ajustes) {
  const diaRevisao = somaDias(inicioDaSemana(agora.data), ajustes.revisao_dia - 1);
  const chegou = agora.data > diaRevisao || agora.data === diaRevisao && agora.minuto >= ajustes.revisao_min;
  return inicioDaSemana(somaDias(diaRevisao, chegou ? -1 : -8));
}
function textoDaRevisao({ categories, commitments, blocks }, segunda, agora) {
  const domingo = somaDias(segunda, 6);
  const estudo = blocosDeEstudo(blocosDoPeriodo(commitments, blocks, segunda, domingo), tagsDeEstudo(categories));
  const r = resumo(estudo, agora);
  if (!r.planejado_min) return "Semana sem estudo planejado. Toque para revisar.";
  return `Semana: ${formatarHoras(r.cumprido_min)} de ${formatarHoras(r.planejado_min)} de estudo. Toque para revisar.`;
}
function formatarHoras(min) {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h${doisDigitos2(m)}` : `${h}h`;
}
var MAX_DIAS_INTERVALO = 5 * 366;

// js/regras/foco.js
var TOLERANCIA_MS = 2 * 6e4;
function proximaFase({ fase, ciclo }, ajustes) {
  if (fase !== "foco") return { fase: "foco", ciclo: ciclo + 1 };
  return { fase: ciclo % ajustes.ciclos_longa === 0 ? "pausa_longa" : "pausa", ciclo };
}
function duracaoS(fase, ajustes) {
  const min = fase === "foco" ? ajustes.foco_min : fase === "pausa" ? ajustes.pausa_min : ajustes.pausa_longa_min;
  return min * 60;
}
function iniciarFase(fase, ciclo, agoraMs, ajustes) {
  return { fase, ciclo, estado: "rodando", termina_em: new Date(agoraMs + duracaoS(fase, ajustes) * 1e3).toISOString(), restante_s: null };
}
function textoDoFim(foco, ajustes) {
  const titulo2 = (foco.titulo || "").trim() || "Modo foco";
  if (foco.fase === "foco") {
    const longa = proximaFase(foco, ajustes).fase === "pausa_longa";
    const pos = (foco.ciclo - 1) % ajustes.ciclos_longa + 1;
    return {
      titulo: titulo2,
      botao: "Começar pausa",
      corpo: `Foco concluído (ciclo ${pos} de ${ajustes.ciclos_longa}). Hora da pausa${longa ? " longa" : ""} de ${longa ? ajustes.pausa_longa_min : ajustes.pausa_min} min.`
    };
  }
  if (foco.fase === "pausa") return { titulo: titulo2, botao: "Começar foco", corpo: `Pausa terminada. Pronto para o foco ${foco.ciclo + 1}?` };
  return { titulo: titulo2, botao: "Começar foco", corpo: "Pausa longa terminada. Começar um novo ciclo?" };
}
function focoNoTique({ foco, instanteMs, fuso, ajustes, enviadas = /* @__PURE__ */ new Set() }) {
  if (!foco || foco.estado !== "rodando" || !foco.termina_em) return { aviso: null, esperando: false };
  const fim = Date.parse(foco.termina_em);
  if (fim > instanteMs) return { aviso: null, esperando: false };
  const chave = `foco:${foco.owner_id}:${foco.termina_em}`;
  const recente = fim > instanteMs - TOLERANCIA_MS;
  const silencio = emSilencio(agoraNoFuso(fim, fuso).minuto, ajustes);
  if (!recente || silencio || enviadas.has(chave)) return { aviso: null, esperando: true };
  return { aviso: { chave, ...textoDoFim(foco, ajustes) }, esperando: true };
}

// js/regras/fila.js
function efeitosDeEstado(bloco, novo, { cards, items }) {
  if (bloco.revisao_id) return { marcarItem: null, perguntarConcluirCard: false };
  let marcarItem = null;
  if (bloco.item_id) {
    if (novo === "done") marcarItem = { id: bloco.item_id, done: true };
    else if (bloco.status === "done") marcarItem = { id: bloco.item_id, done: false };
  }
  let perguntarConcluirCard = false;
  if (novo === "done" && bloco.kind === "study" && bloco.card_id) {
    const c = cards.find((x) => x.id === bloco.card_id);
    perguntarConcluirCard = !!c && !c.is_fixed && !items.some((i) => i.card_id === c.id);
  }
  return { marcarItem, perguntarConcluirCard };
}

// supabase/functions/lembretes/webpush.js
var sutil = globalThis.crypto.subtle;
var enc = new TextEncoder();
function paraB64u(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64u(texto) {
  const s = atob(texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
var juntar = (...partes) => {
  const saida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
};
async function hmac(chave, dados) {
  const k = await sutil.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await sutil.sign("HMAC", k, dados));
}
async function hkdf(sal, ikm, info, tamanho) {
  const prk = await hmac(sal, ikm);
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tamanho);
}
async function chavePrivadaVapid(publica, privada) {
  const pub = deB64u(publica);
  return sutil.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    d: privada,
    x: paraB64u(pub.slice(1, 33)),
    y: paraB64u(pub.slice(33, 65)),
    ext: true
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
async function cabecalhosVapid({ endpoint, publica, privada, assunto, agoraS = Math.floor(Date.now() / 1e3) }) {
  const cab = paraB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = paraB64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: agoraS + 12 * 3600, sub: assunto })));
  const chave = await chavePrivadaVapid(publica, privada);
  const assinatura = await sutil.sign({ name: "ECDSA", hash: "SHA-256" }, chave, enc.encode(`${cab}.${corpo}`));
  return { Authorization: `vapid t=${cab}.${corpo}.${paraB64u(assinatura)}, k=${publica}` };
}
async function cifrar({ p256dh, auth, texto }) {
  const uaPublica = deB64u(p256dh);
  const segredo = deB64u(auth);
  const efemera = await sutil.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublica = new Uint8Array(await sutil.exportKey("raw", efemera.publicKey));
  const uaChave = await sutil.importKey("raw", uaPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartilhado = new Uint8Array(await sutil.deriveBits({ name: "ECDH", public: uaChave }, efemera.privateKey, 256));
  const ikm = await hkdf(segredo, compartilhado, juntar(enc.encode("WebPush: info\0"), uaPublica, asPublica), 32);
  const sal = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const chave = await sutil.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const claro = juntar(enc.encode(texto), new Uint8Array([2]));
  const cifrado = new Uint8Array(await sutil.encrypt({ name: "AES-GCM", iv: nonce }, chave, claro));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return juntar(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}
async function enviarPush({ inscricao, payload, vapid: vapid2, fetch: fetch2 = globalThis.fetch, ttl = 600, urgencia = "high" }) {
  const corpo = await cifrar({ p256dh: inscricao.p256dh, auth: inscricao.auth, texto: JSON.stringify(payload) });
  const { Authorization } = await cabecalhosVapid({ endpoint: inscricao.endpoint, publica: vapid2.publica, privada: vapid2.privada, assunto: vapid2.assunto });
  const resp = await fetch2(inscricao.endpoint, {
    method: "POST",
    headers: { Authorization, "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(ttl), Urgency: urgencia },
    body: corpo
  });
  return { status: resp.status };
}

// supabase/functions/lembretes/servico.js
var PADROES = {
  notif_antes_min: 10,
  notif_resumo: true,
  notif_resumo_min: 420,
  notif_pendencias: true,
  notif_pendencias_min: 1290,
  notif_silencio: false,
  notif_silencio_de: 1320,
  notif_silencio_ate: 420,
  fuso: "America/Sao_Paulo",
  sequencia_min: 30,
  revisao: true,
  revisao_dia: 7,
  revisao_min: 1200,
  foco_min: 25,
  pausa_min: 5,
  pausa_longa_min: 15,
  ciclos_longa: 4,
  foco_som: true,
  revisoes_dias: [7, 30],
  modelos_com_fixas: false,
  flash_card_novos_dia: 20,
  flash_card_revisoes_dia: 200,
  flash_card_fator: 2.5,
  flash_aviso: true,
  flash_aviso_min: 1140
};
var ORIGENS = [/^https:\/\/matheusbellei\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
var TITULO_ACAO = { cumprir: "Cumprido", adiar: "Adiar 10 min", proxima: "Próxima fase" };
var VALIDADE_TOKEN_S = 24 * 3600;
var ADIAR_MS = 10 * 6e4;
var GUARDAR_ENVIADAS_MS = 14 * 864e5;
var enc2 = new TextEncoder();
async function hmac2(segredo, texto) {
  const k = await crypto.subtle.importKey("raw", enc2.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc2.encode(texto)));
}
async function assinarToken(segredo, { dono, ref, data, acao, expira }) {
  const dados = [dono, ref, data, acao, expira].join("|");
  return `${paraB64u(enc2.encode(dados))}.${paraB64u(await hmac2(segredo, dados))}`;
}
async function lerToken(segredo, token) {
  const [d, a] = String(token || "").split(".");
  if (!d || !a) return null;
  let dados;
  try {
    dados = new TextDecoder().decode(deB64u(d));
  } catch {
    return null;
  }
  const certa = paraB64u(await hmac2(segredo, dados));
  if (certa.length !== a.length) return null;
  let dif = 0;
  for (let i = 0; i < certa.length; i++) dif |= certa.charCodeAt(i) ^ a.charCodeAt(i);
  if (dif) return null;
  const [dono, ref, data, acao, expira] = dados.split("|");
  return { dono, ref, data, acao, expira: Number(expira) };
}
function cabecalhosCors(req) {
  const origem = req.headers.get("origin") || "";
  const h = { "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" };
  if (ORIGENS.some((re) => re.test(origem))) h["Access-Control-Allow-Origin"] = origem;
  return h;
}
function criarServico({ banco: banco2, enviar, agora = () => Date.now(), env: env2 }) {
  const urlDaFuncao = `${env2.SUPABASE_URL}/functions/v1/lembretes`;
  async function payloadDe(dono, n) {
    const expira = Math.floor(agora() / 1e3) + VALIDADE_TOKEN_S;
    const acoes = [];
    for (const acao2 of n.acoes) {
      const t = await assinarToken(env2.LEMBRETES_SEGREDO, { dono, ref: n.ref, data: n.data, acao: acao2, expira });
      acoes.push({ acao: acao2, titulo: n.tituloAcao || TITULO_ACAO[acao2], url: `${urlDaFuncao}?acao=${acao2}&t=${encodeURIComponent(t)}` });
    }
    const url = n.url || (n.ref ? `./?bloco=${encodeURIComponent(n.ref)}&data=${n.data}` : `./?data=${n.data}`);
    return { titulo: n.titulo, corpo: n.corpo, tag: n.chave, url, acoes };
  }
  async function enviarParaAparelhos(aparelhos, payload) {
    let aceitos = 0;
    let passageiras = 0;
    for (const sub of aparelhos) {
      let status = 0;
      try {
        ({ status } = await enviar(sub, payload));
      } catch {
        status = 0;
      }
      if (status === 404 || status === 410) {
        await banco2.remove("push_subscriptions", { id: sub.id });
        continue;
      }
      const ok = status >= 200 && status < 300;
      if (ok) aceitos += 1;
      else if (status === 0 || status === 429 || status >= 500) passageiras += 1;
      try {
        await banco2.update("push_subscriptions", { id: sub.id }, { ultimo_status: status, ...ok ? { ultimo_ok: new Date(agora()).toISOString() } : {} });
      } catch {
      }
    }
    return { aceitos, passageiras };
  }
  async function tique() {
    const inscricoes = await banco2.select("push_subscriptions", {});
    const donos = [...new Set(inscricoes.map((s) => s.owner_id))];
    const focos = donos.length ? await banco2.select("focos", { owner_id: { in: donos } }) : [];
    let total = 0;
    for (const dono of donos) {
      const [linha] = await banco2.select("settings", { owner_id: dono });
      const ajustes = { ...PADROES, ...Object.fromEntries(Object.entries(linha || {}).filter(([, v]) => v !== null && v !== void 0)) };
      const { data: hoje } = agoraNoFuso(agora(), ajustes.fuso);
      const amanha = somaDias(hoje, 1);
      const [commitments, blocks, adiamentos, enviadasLinhas] = await Promise.all([
        banco2.select("commitments", { owner_id: dono }),
        banco2.select("blocks", { owner_id: dono, date: { in: [hoje, amanha] } }),
        banco2.select("adiamentos", { owner_id: dono }),
        banco2.select("notificacoes_enviadas", { owner_id: dono })
      ]);
      const lista = devidos({
        instanteMs: agora(),
        fuso: ajustes.fuso,
        ajustes,
        adiamentos,
        blocos: blocosDoPeriodo(commitments, blocks, hoje, amanha),
        enviadas: new Set(enviadasLinhas.map((e) => e.chave))
      });
      const enviadas = new Set(enviadasLinhas.map((e) => e.chave));
      const revisao = revisaoVence({ instanteMs: agora(), fuso: ajustes.fuso, ajustes, enviadas });
      if (revisao) {
        const agoraLocal = agoraNoFuso(agora(), ajustes.fuso);
        const segunda = semanaDaRevisao(agoraLocal, ajustes);
        const domingo = somaDias(segunda, 6);
        const [categories, semana] = await Promise.all([
          banco2.select("categories", { owner_id: dono }),
          banco2.select("blocks", { owner_id: dono, date: { gte: segunda, lte: domingo } })
        ]);
        lista.push({
          ...revisao,
          tipo: "revisao",
          titulo: "Revisão da semana",
          acoes: [],
          url: "./?tela=revisao",
          corpo: textoDaRevisao({ categories, commitments, blocks: semana }, segunda, agoraLocal)
        });
      }
      const avisoFlash = flashVence({ instanteMs: agora(), fuso: ajustes.fuso, ajustes, enviadas });
      if (avisoFlash) {
        const [baralhos, cards, flashcards, flash_lados] = await Promise.all([
          banco2.select("baralhos", { owner_id: dono }),
          banco2.select("cards", { owner_id: dono }),
          banco2.select("flashcards", { owner_id: dono }),
          banco2.select("flash_lados", { owner_id: dono })
        ]);
        const { total: total2 } = paraHoje({ baralhos, cards, flashcards, flash_lados }, avisoFlash.data, ajustes);
        if (total2 > 0) lista.push({ ...avisoFlash, tipo: "flash", titulo: "Flashcards", corpo: textoDoAvisoFlash(total2), acoes: [], url: "./?tela=flashcards" });
      }
      const foco = focos.find((f) => f.owner_id === dono);
      const fimDoFoco = focoNoTique({ foco, instanteMs: agora(), fuso: ajustes.fuso, ajustes, enviadas });
      if (fimDoFoco.aviso) {
        const { chave, titulo: titulo2, corpo, botao } = fimDoFoco.aviso;
        lista.push({ chave, tipo: "foco", titulo: titulo2, corpo, acoes: ["proxima"], tituloAcao: botao, ref: "foco", data: foco.termina_em, url: "./?tela=foco" });
      }
      const aparelhos = inscricoes.filter((s) => s.owner_id === dono);
      for (const n of lista) {
        if (n.tipo === "foco") {
          const [atual] = await banco2.select("focos", { owner_id: dono });
          if (!atual || atual.estado !== "rodando" || atual.termina_em !== foco.termina_em) continue;
        }
        const gravou = await banco2.insert("notificacoes_enviadas", { owner_id: dono, chave: n.chave, enviada_em: new Date(agora()).toISOString() }, { ignorarConflito: true });
        if (!gravou.length) continue;
        const { aceitos, passageiras } = await enviarParaAparelhos(aparelhos, await payloadDe(dono, n));
        if (!aceitos && passageiras) await banco2.remove("notificacoes_enviadas", { owner_id: dono, chave: n.chave });
        total += 1;
      }
      if (fimDoFoco.esperando) {
        await banco2.update("focos", { owner_id: dono, termina_em: foco.termina_em }, { estado: "esperando", atualizado_em: new Date(agora()).toISOString() });
      }
    }
    await banco2.remove("notificacoes_enviadas", { enviada_em: { lt: new Date(agora() - GUARDAR_ENVIADAS_MS).toISOString() } });
    await banco2.remove("adiamentos", { quando: { lt: new Date(agora() - 36e5).toISOString() } });
    return { enviadas: total };
  }
  async function acharBloco(dono, ref, data) {
    if (!ref.startsWith("v:")) return (await banco2.select("blocks", { id: ref, owner_id: dono }))[0] || null;
    const fixa = ref.slice(2);
    const gravado = (await banco2.select("blocks", { owner_id: dono, commitment_id: fixa, date: data }))[0];
    if (gravado) return gravado;
    const [c] = await banco2.select("commitments", { id: fixa, owner_id: dono });
    return c ? ocorrenciasDeCompromissos([c], data, data)[0] || null : null;
  }
  async function cumprir(dono, ref, data) {
    const bloco = await acharBloco(dono, ref, data);
    if (!bloco || bloco.cancelled || bloco.status !== "planned") return { ok: true, nada: true };
    const [cards, items] = await Promise.all([banco2.select("cards", { owner_id: dono }), banco2.select("items", { owner_id: dono })]);
    const { marcarItem } = efeitosDeEstado(bloco, "done", { cards, items });
    if (bloco.virtual) {
      await banco2.insert("blocks", {
        owner_id: dono,
        commitment_id: bloco.commitment_id,
        date: bloco.date,
        start_min: bloco.start_min,
        end_min: bloco.end_min,
        kind: bloco.kind,
        card_id: bloco.card_id || null,
        title: bloco.title,
        category_id: bloco.category_id || null,
        lembrete_min: bloco.lembrete_min ?? null,
        status: "done",
        instead_note: ""
      });
    } else {
      await banco2.update("blocks", { id: bloco.id, owner_id: dono }, { status: "done" });
    }
    if (marcarItem) {
      try {
        await banco2.update("items", { id: marcarItem.id, owner_id: dono }, { done: marcarItem.done });
      } catch (err) {
        if (!bloco.virtual) await banco2.update("blocks", { id: bloco.id, owner_id: dono }, { status: "planned" });
        throw err;
      }
    }
    return { ok: true };
  }
  async function proximaDoFoco(dono, terminaEm) {
    const [foco] = await banco2.select("focos", { owner_id: dono });
    const mesma = foco && foco.termina_em && Date.parse(foco.termina_em) === Date.parse(terminaEm);
    if (!mesma || !["rodando", "esperando"].includes(foco.estado)) return { ok: true, nada: true };
    const [linha] = await banco2.select("settings", { owner_id: dono });
    const ajustes = { ...PADROES, ...Object.fromEntries(Object.entries(linha || {}).filter(([, v]) => v !== null && v !== void 0)) };
    const p = proximaFase(foco, ajustes);
    await banco2.update(
      "focos",
      { owner_id: dono, termina_em: foco.termina_em },
      { ...iniciarFase(p.fase, p.ciclo, agora(), ajustes), atualizado_em: new Date(agora()).toISOString() }
    );
    return { ok: true };
  }
  async function acao(req, url) {
    const pedida = url.searchParams.get("acao");
    const t = await lerToken(env2.LEMBRETES_SEGREDO, url.searchParams.get("t"));
    if (!t || t.acao !== pedida || !(t.expira > agora() / 1e3)) return resposta(req, 403, { erro: "Link vencido ou inválido." });
    if (pedida === "cumprir") return resposta(req, 200, await cumprir(t.dono, t.ref, t.data));
    if (pedida === "adiar") {
      await banco2.insert("adiamentos", { owner_id: t.dono, ref: t.ref, data: t.data, quando: new Date(agora() + ADIAR_MS).toISOString() });
      return resposta(req, 200, { ok: true });
    }
    if (pedida === "proxima") return resposta(req, 200, await proximaDoFoco(t.dono, t.data));
    return resposta(req, 400, { erro: "Ação desconhecida." });
  }
  async function registrarTique(campos) {
    try {
      await banco2.salvar("lembretes_status", { id: 1, ...campos });
    } catch {
    }
  }
  async function diagnostico(req) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const usuario = jwt ? await banco2.usuarioDoJwt(jwt) : null;
    if (!usuario) return resposta(req, 401, { erro: "Entre no app de novo." });
    let corpo = {};
    try {
      corpo = await req.json();
    } catch {
    }
    const chaves = {
      publica: Boolean(env2.VAPID_PUBLIC_KEY),
      publicaIgual: Boolean(env2.VAPID_PUBLIC_KEY) && corpo.vapidPublica === env2.VAPID_PUBLIC_KEY,
      privada: Boolean(env2.VAPID_PRIVADA_OK),
      segredo: Boolean(env2.LEMBRETES_SEGREDO)
    };
    let bancoOk = "ok";
    let status = null;
    let sub = null;
    try {
      [sub] = await banco2.select("push_subscriptions", { owner_id: usuario.id, endpoint: corpo.endpoint || "" });
      try {
        [status] = await banco2.select("lembretes_status", { id: 1 });
      } catch {
        status = null;
      }
    } catch (err) {
      bancoOk = String(err?.message || err);
    }
    const ultimo = status?.ultimo_tique ? Date.parse(status.ultimo_tique) : null;
    return resposta(req, 200, {
      chaves,
      banco: bancoOk,
      agendador: {
        ultimoTique: status?.ultimo_tique || null,
        segundosDesdeUltimo: ultimo ? Math.round((agora() - ultimo) / 1e3) : null,
        ultimoErro: status?.ultimo_erro || null,
        erroEm: status?.erro_em || null
      },
      aparelho: { ativado: Boolean(sub), ultimoOk: sub?.ultimo_ok || null, ultimoStatus: sub?.ultimo_status ?? null }
    });
  }
  async function teste(req) {
    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const usuario = jwt ? await banco2.usuarioDoJwt(jwt) : null;
    if (!usuario) return resposta(req, 401, { erro: "Entre no app de novo." });
    let corpo = {};
    try {
      corpo = await req.json();
    } catch {
    }
    const [sub] = await banco2.select("push_subscriptions", { owner_id: usuario.id, endpoint: corpo.endpoint || "" });
    if (!sub) return resposta(req, 404, { erro: "Este aparelho não está ativado." });
    const { status } = await enviar(sub, { titulo: "Teste", corpo: "As notificações da Agenda de Estudos estão funcionando.", tag: "teste", url: "./", acoes: [] });
    const ok = status >= 200 && status < 300;
    try {
      await banco2.update("push_subscriptions", { id: sub.id }, { ultimo_status: status, ...ok ? { ultimo_ok: new Date(agora()).toISOString() } : {} });
    } catch {
    }
    return resposta(req, ok ? 200 : 502, { status });
  }
  function resposta(req, status, corpo) {
    return new Response(corpo === null ? null : JSON.stringify(corpo), { status, headers: { ...cabecalhosCors(req), "Content-Type": "application/json" } });
  }
  async function tratar(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecalhosCors(req) });
    try {
      if (req.method === "GET" && url.searchParams.has("acao")) return await acao(req, url);
      if (req.method === "POST" && url.searchParams.get("teste") === "1") return await teste(req);
      if (req.method === "POST" && url.searchParams.get("diagnostico") === "1") return await diagnostico(req);
      if (req.method === "POST") {
        if (req.headers.get("x-lembretes-segredo") !== env2.LEMBRETES_SEGREDO || !env2.LEMBRETES_SEGREDO) return resposta(req, 401, { erro: "Sem permissão." });
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
      return resposta(req, 404, { erro: "Não encontrado." });
    } catch (err) {
      return resposta(req, 500, { erro: String(err?.message || err) });
    }
  }
  return { tratar, tique };
}

// supabase/functions/lembretes/entrada.js
var env = (nome) => Deno.env.get(nome) || "";
var URL_PROJETO = env("SUPABASE_URL");
function chaveDeServico() {
  try {
    const k = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}").default;
    if (k) return k;
  } catch {
  }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}
var CHAVE_SERVICO = chaveDeServico();
var base = CHAVE_SERVICO.startsWith("sb_secret_") ? { apikey: CHAVE_SERVICO } : { apikey: CHAVE_SERVICO, Authorization: `Bearer ${CHAVE_SERVICO}` };
function consulta(filtros = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v && typeof v === "object" && "in" in v) p.append(k, `in.(${v.in.map((x) => `"${x}"`).join(",")})`);
    else if (v && typeof v === "object" && "lt" in v) p.append(k, `lt.${v.lt}`);
    else if (v && typeof v === "object" && "gte" in v) {
      p.append(k, `gte.${v.gte}`);
      if ("lte" in v) p.append(k, `lte.${v.lte}`);
    } else p.append(k, `eq.${v}`);
  }
  return p;
}
async function pedir(caminho, init) {
  const r = await fetch(`${URL_PROJETO}/rest/v1/${caminho}`, { ...init, headers: { ...base, "Content-Type": "application/json", ...init?.headers || {} } });
  if (!r.ok) throw new Error(`${init?.method || "GET"} ${caminho.split("?")[0]}: ${r.status} ${await r.text()}`);
  const texto = await r.text();
  return texto ? JSON.parse(texto) : [];
}
var CONFLITO = { notificacoes_enviadas: "owner_id,chave" };
var banco = {
  select: (t, f) => {
    const q = consulta(f);
    q.set("select", "*");
    return pedir(`${t}?${q}`);
  },
  insert: (t, linha, { ignorarConflito } = {}) => pedir(`${t}${ignorarConflito && CONFLITO[t] ? `?on_conflict=${CONFLITO[t]}` : ""}`, {
    method: "POST",
    body: JSON.stringify(linha),
    headers: { Prefer: `return=representation${ignorarConflito ? ",resolution=ignore-duplicates" : ""}` }
  }),
  update: (t, f, campos) => pedir(`${t}?${consulta(f)}`, { method: "PATCH", body: JSON.stringify(campos), headers: { Prefer: "return=representation" } }),
  remove: (t, f) => pedir(`${t}?${consulta(f)}`, { method: "DELETE" }),
  // Grava ou atualiza pela chave primária (id), mudando só as colunas enviadas.
  salvar: (t, linha) => pedir(`${t}?on_conflict=id`, {
    method: "POST",
    body: JSON.stringify(linha),
    headers: { Prefer: "return=representation,resolution=merge-duplicates" }
  }),
  async usuarioDoJwt(jwt) {
    const r = await fetch(`${URL_PROJETO}/auth/v1/user`, { headers: { apikey: CHAVE_SERVICO, Authorization: `Bearer ${jwt}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id } : null;
  }
};
var vapid = { publica: env("VAPID_PUBLIC_KEY"), privada: env("VAPID_PRIVATE_KEY"), assunto: env("VAPID_SUBJECT") || "mailto:agenda@exemplo.com" };
var servico = criarServico({
  banco,
  enviar: (inscricao, payload) => enviarPush({ inscricao, payload, vapid }),
  env: { SUPABASE_URL: URL_PROJETO, LEMBRETES_SEGREDO: env("LEMBRETES_SEGREDO"), VAPID_PUBLIC_KEY: vapid.publica, VAPID_PRIVADA_OK: Boolean(vapid.privada) }
});
Deno.serve((req) => servico.tratar(req));
