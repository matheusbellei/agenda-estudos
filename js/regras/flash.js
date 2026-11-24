// Flashcards: agendamento de 2 botões (Errei/Acertei), fila da sessão com limites do dia, "para hoje",
// lacunas e resposta digitada. Regra pura: usada pelas telas e pela função "lembretes".
import { somaDias, inicioDaSemana } from './datas.js';
import { semMarcacao } from './marcacao.js';

export function ladosDoTipo(tipo) {
  return tipo === 'invertido' ? ['frente', 'verso'] : ['frente'];
}

// Uma resposta num lado. `eraNovo` = primeira resposta da vida do lado; `primeiraDoDia` = primeira resposta de hoje.
export function responder(lado, acertou, { hoje, fator }) {
  const eraNovo = !lado.introduzido_em;
  const primeiraDoDia = !(lado.introduzido_em === hoje || lado.revisado_em === hoje);
  const marca = eraNovo ? { introduzido_em: hoje } : primeiraDoDia ? { revisado_em: hoje } : {};
  if (!acertou) return { patch: { intervalo: 0, vence: hoje, errado_em: hoje, ...marca }, primeiraDoDia, eraNovo };
  const recomeca = eraNovo || lado.errado_em === hoje;
  const intervalo = recomeca ? 1 : Math.max((lado.intervalo || 0) + 1, Math.round((lado.intervalo || 0) * fator));
  return { patch: { intervalo, vence: somaDias(hoje, intervalo), ...marca }, primeiraDoDia, eraNovo };
}

export function limitesDe(flashcard, { baralhos, ajustes }) {
  if (flashcard.baralho_id) {
    const b = baralhos.find((x) => x.id === flashcard.baralho_id) || {};
    return { novos: b.novos_dia ?? 20, revisoes: b.revisoes_dia ?? 200, fator: Number(b.fator ?? 2.5) };
  }
  return { novos: ajustes.flash_card_novos_dia, revisoes: ajustes.flash_card_revisoes_dia, fator: Number(ajustes.flash_card_fator) };
}

const porCriacao = (a, b) => String(a.flashcard.criado_em || '').localeCompare(String(b.flashcard.criado_em || ''));

// Fila de uma sessão (um baralho ou um card): vencidos (mais antigos primeiro) até o que sobra do limite de revisões,
// novos (por criação) até o que sobra do limite de novos, e por último os errados de hoje (não gastam limite).
export function filaDaSessao({ flashcards, lados, hoje, limites }) {
  const daqui = new Set(flashcards.map((f) => f.id));
  const meus = lados.filter((l) => daqui.has(l.flashcard_id));
  const novosHoje = meus.filter((l) => l.introduzido_em === hoje).length;
  const revisadosHoje = meus.filter((l) => l.revisado_em === hoje && l.introduzido_em !== hoje).length;
  const revisoes = []; const novos = []; const errados = [];
  for (const flashcard of flashcards) {
    for (const nome of ladosDoTipo(flashcard.tipo)) {
      const l = meus.find((x) => x.flashcard_id === flashcard.id && x.lado === nome);
      const item = { flashcard, lado: nome, registro: l || null };
      if (!l || (!l.vence && !l.introduzido_em)) novos.push(item);
      else if (l.vence && l.vence <= hoje) (l.errado_em === hoje ? errados : revisoes).push(item);
    }
  }
  revisoes.sort((a, b) => a.registro.vence.localeCompare(b.registro.vence) || porCriacao(a, b));
  novos.sort(porCriacao);
  return [
    ...revisoes.slice(0, Math.max(0, limites.revisoes - revisadosHoje)),
    ...novos.slice(0, Math.max(0, limites.novos - novosHoje)),
    ...errados,
  ];
}

// O que uma sessão serviria agora, por baralho e por card, e o total (contador do menu e aviso).
export function paraHoje({ baralhos = [], cards = [], flashcards = [], flash_lados: lados = [] }, hoje, ajustes) {
  const grupos = new Map();
  // Card arquivado sai da conta (seus flashcards continuam lá se ele voltar).
  const arquivados = new Set(cards.filter((c) => c.archived).map((c) => c.id));
  for (const f of flashcards) {
    if (f.card_id && arquivados.has(f.card_id)) continue;
    const chave = f.baralho_id ? `b:${f.baralho_id}` : `c:${f.card_id}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(f);
  }
  const porBaralho = new Map(); const porCard = new Map();
  let total = 0;
  for (const [chave, lista] of grupos) {
    const fila = filaDaSessao({ flashcards: lista, lados, hoje, limites: limitesDe(lista[0], { baralhos, ajustes }) });
    const novos = fila.filter((x) => !x.registro || (!x.registro.vence && !x.registro.introduzido_em)).length;
    const contagem = { novos, revisar: fila.length - novos };
    (chave.startsWith('b:') ? porBaralho : porCard).set(chave.slice(2), contagem);
    total += fila.length;
  }
  return { total, porBaralho, porCard };
}

const LACUNA = /\{\{(.*?)\}\}/g;

export function pergunta(flashcard, lado) {
  if (flashcard.tipo === 'invertido' && lado === 'verso') return flashcard.verso;
  if (flashcard.tipo === 'lacuna') return flashcard.frente.replace(LACUNA, '[...]');
  return flashcard.frente;
}

export function resposta(flashcard, lado) {
  if (flashcard.tipo === 'invertido' && lado === 'verso') return { texto: flashcard.frente };
  if (flashcard.tipo === 'lacuna') return { texto: flashcard.frente.replace(LACUNA, '==$1=='), observacao: flashcard.verso };
  return { texto: flashcard.verso };
}

// "Digitar": acerto só se for idêntico (acentos e maiúsculas contam; só os espaços das pontas são ignorados).
export function confereDigitado(digitado, flashcard) {
  // Formatação só sai quando está "fechada" (**x**, *x*, ==x==); asterisco solto (2*3*4) fica.
  const certa = semMarcacao(flashcard.verso).trim();
  const d = String(digitado).trim();
  let ini = 0;
  while (ini < d.length && ini < certa.length && d[ini] === certa[ini]) ini += 1;
  let fim = 0;
  while (fim < d.length - ini && fim < certa.length - ini && d[d.length - 1 - fim] === certa[certa.length - 1 - fim]) fim += 1;
  const trechos = [
    { texto: d.slice(0, ini), igual: true },
    { texto: d.slice(ini, d.length - fim), igual: false },
    { texto: d.slice(d.length - fim), igual: true },
  ];
  return { acertou: d === certa, certa, digitado: d, trechos: d === certa ? [{ texto: d, igual: true }] : trechos };
}

export function validarFlashcard({ tipo, frente, verso }) {
  const f = String(frente || ''); const v = String(verso || '');
  if (!f.trim()) return 'Escreva a frente.';
  if (f.length > 2000 || v.length > 2000) return 'Use até 2000 letras em cada lado.';
  if (tipo === 'lacuna') {
    const abertas = (f.match(/\{\{/g) || []).length;
    const fechadas = [...f.matchAll(LACUNA)];
    if (!abertas) return 'Marque pelo menos uma lacuna com {{ }}.';
    if (fechadas.length !== abertas || fechadas.some((m) => !m[1].trim())) return 'Há uma lacuna sem fechar ou vazia.';
    return null;
  }
  if (!v.trim()) return tipo === 'digitar' ? 'Escreva a resposta exata.' : 'Escreva o verso.';
  if (tipo === 'digitar' && /\n/.test(v.trim())) return 'A resposta exata precisa ser de uma linha só.';
  return null;
}

export function textoDoAvisoFlash(n) {
  return `Você tem ${n} ${n === 1 ? 'flashcard' : 'flashcards'} para hoje.`;
}

const inicioDoGrao = (iso, grao, de) => {
  if (grao === 'dia') return iso;
  const ini = grao === 'mes' ? `${iso.slice(0, 7)}-01` : inicioDaSemana(iso);
  return ini < de ? de : ini;
};

// Cartões revisados (e acertos de primeira) por dia/semana/mês, a partir do resumo diário.
export function serieFlash(dias, de, ate, grao) {
  const barras = []; const indice = new Map();
  for (let d = de; d <= ate; d = somaDias(d, 1)) {
    const ini = inicioDoGrao(d, grao, de);
    if (!indice.has(ini)) { indice.set(ini, barras.length); barras.push({ inicio: ini, revisados: 0, acertos: 0 }); }
  }
  for (const x of dias) {
    if (x.data < de || x.data > ate) continue;
    const b = barras[indice.get(inicioDoGrao(x.data, grao, de))];
    b.revisados += x.revisados; b.acertos += x.acertos;
  }
  return barras;
}

export function acertoDoPeriodo(dias, de, ate) {
  const doPeriodo = dias.filter((x) => x.data >= de && x.data <= ate);
  const revisados = doPeriodo.reduce((s, x) => s + x.revisados, 0);
  return revisados ? Math.round((doPeriodo.reduce((s, x) => s + x.acertos, 0) * 100) / revisados) : null;
}
