// Contas do acompanhamento (Dashboards, revisão da semana, meta do card e aviso da revisão).
// Regra pura: usada pelas telas e pela função "lembretes", para os números baterem em todo lugar.
// `agora` = { data: 'YYYY-MM-DD', minuto } no fuso dos ajustes.
import { somaDias, diaDaSemana, inicioDaSemana, rotuloSemana, MESES } from './datas.js';
import { blocosDoPeriodo } from './calendario.js';

const duracao = (b) => b.end_min - b.start_min;
const diasEntre = (de, ate) => {
  const ms = (iso) => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((ms(ate) - ms(de)) / 86400000);
};
const partes = (iso) => iso.split('-').map(Number);
const doisDigitos = (n) => String(n).padStart(2, '0');

// Tag marcada, ou subtag de mãe marcada.
export function tagsDeEstudo(categories) {
  const marcadas = new Set(categories.filter((c) => c.conta_estudo).map((c) => c.id));
  return new Set(categories.filter((c) => marcadas.has(c.id) || (c.parent_id && marcadas.has(c.parent_id))).map((c) => c.id));
}

export function blocosDeEstudo(blocos, estudo) {
  return blocos.filter((b) => !b.cancelled && b.category_id && estudo.has(b.category_id));
}

const terminou = (b, agora) => b.date < agora.data || (b.date === agora.data && b.end_min <= agora.minuto);

export function situacao(b, agora) {
  if (b.status === 'done') return 'cumprido';
  if (b.status === 'missed') return 'nao_feito';
  return terminou(b, agora) ? 'sem_marcar' : 'futuro';
}

export function resumo(blocosEstudo, agora) {
  const r = { planejado_min: 0, cumprido_min: 0, cumpridos: 0, nao_feitos: 0, nao_feito_min: 0, pct: null };
  for (const b of blocosEstudo) {
    r.planejado_min += duracao(b);
    const s = situacao(b, agora);
    if (s === 'cumprido') { r.cumpridos += 1; r.cumprido_min += duracao(b); }
    else if (s !== 'futuro') { r.nao_feitos += 1; r.nao_feito_min += duracao(b); }
  }
  const terminados = r.cumpridos + r.nao_feitos;
  r.pct = terminados ? Math.round((r.cumpridos * 100) / terminados) : null;
  return r;
}

function cumpridoPorDia(blocosEstudo) {
  const m = new Map();
  for (const b of blocosEstudo) if (b.status === 'done') m.set(b.date, (m.get(b.date) || 0) + duracao(b));
  return m;
}

// Dias seguidos até ontem com o mínimo, mais hoje se hoje já chegou nele.
export function sequencia(blocosEstudo, agora, minimo) {
  const porDia = cumpridoPorDia(blocosEstudo);
  let n = (porDia.get(agora.data) || 0) >= minimo ? 1 : 0;
  for (let d = somaDias(agora.data, -1); (porDia.get(d) || 0) >= minimo; d = somaDias(d, -1)) n += 1;
  return n;
}

const ultimoDiaDoMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();

export function periodo(tipo, ancora, intervalo) {
  const [a, m] = partes(ancora);
  if (tipo === 'semana') {
    const de = inicioDaSemana(ancora); const ate = somaDias(de, 6);
    return { de, ate, rotulo: rotuloSemana([de, ate]) };
  }
  if (tipo === 'mes') {
    return { de: `${a}-${doisDigitos(m)}-01`, ate: `${a}-${doisDigitos(m)}-${ultimoDiaDoMes(a, m)}`, rotulo: `${MESES[m - 1]} de ${a}` };
  }
  if (tipo === 'ano') return { de: `${a}-01-01`, ate: `${a}-12-31`, rotulo: String(a) };
  const { de, ate } = intervalo;
  const [a1, m1, d1] = partes(de); const [a2, m2, d2] = partes(ate);
  if (a1 === a2 && m1 === m2) return { de, ate, rotulo: d1 === d2 ? `${d1} de ${MESES[m1 - 1]}` : rotuloSemana([de, ate]) };
  const ini = a1 === a2 ? `${d1} de ${MESES[m1 - 1]}` : `${d1} de ${MESES[m1 - 1]} de ${a1}`;
  const fim = a1 === a2 ? `${d2} de ${MESES[m2 - 1]}` : `${d2} de ${MESES[m2 - 1]} de ${a2}`;
  return { de, ate, rotulo: `${ini} a ${fim}` };
}

export function deslocar(tipo, ancora, n) {
  const [a, m] = partes(ancora);
  if (tipo === 'semana') return somaDias(inicioDaSemana(ancora), 7 * n);
  if (tipo === 'mes') {
    const total = a * 12 + (m - 1) + n;
    return `${Math.floor(total / 12)}-${doisDigitos((total % 12) + 1)}-01`;
  }
  if (tipo === 'ano') return `${a + n}-01-01`;
  return ancora;
}

// Dias contados com início e fim: até 31 → dia; até 182 → semana; mais → mês.
export function graoDoIntervalo(de, ate) {
  const dias = diasEntre(de, ate) + 1;
  if (dias <= 31) return 'dia';
  return dias <= 182 ? 'semana' : 'mes';
}

const inicioDoGrao = (iso, grao, de) => {
  if (grao === 'dia') return iso;
  if (grao === 'mes') return `${iso.slice(0, 7)}-01` < de ? de : `${iso.slice(0, 7)}-01`;
  const s = inicioDaSemana(iso);
  return s < de ? de : s;
};

export function serie(blocosEstudo, de, ate, grao) {
  const barras = [];
  const indice = new Map();
  for (let d = de; d <= ate; d = somaDias(d, 1)) {
    const ini = inicioDoGrao(d, grao, de);
    if (!indice.has(ini)) { indice.set(ini, barras.length); barras.push({ inicio: ini, planejado_min: 0, cumprido_min: 0 }); }
  }
  for (const b of blocosEstudo) {
    if (b.date < de || b.date > ate) continue;
    const barra = barras[indice.get(inicioDoGrao(b.date, grao, de))];
    barra.planejado_min += duracao(b);
    if (b.status === 'done') barra.cumprido_min += duracao(b);
  }
  return barras;
}

const faixaDe = (min) => (min < 720 ? 0 : min < 1080 ? 1 : 2);

export function mapaNaoFeito(blocosEstudo, agora) {
  const celulas = Array.from({ length: 7 }, () => Array.from({ length: 3 }, () => ({ terminados: 0, nao_feitos: 0 })));
  for (const b of blocosEstudo) {
    const s = situacao(b, agora);
    if (s === 'futuro') continue;
    const c = celulas[diaDaSemana(b.date) - 1][faixaDe(b.start_min)];
    c.terminados += 1;
    if (s !== 'cumprido') c.nao_feitos += 1;
  }
  return celulas;
}

const NOMES_DIAS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const NOMES_FAIXAS = ['de manhã', 'à tarde', 'à noite'];
const juntar = (lista) => (lista.length < 2 ? lista.join('') : `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}`);

export function piorHorario(celulas) {
  let maior = 0;
  celulas.forEach((dia) => dia.forEach((c) => { maior = Math.max(maior, c.nao_feitos); }));
  if (!maior) return null;
  const nomes = [];
  celulas.forEach((dia, d) => dia.forEach((c, f) => { if (c.nao_feitos === maior && nomes.length < 3) nomes.push(`${NOMES_DIAS[d]} ${NOMES_FAIXAS[f]}`); }));
  return `Mais falhas: ${juntar(nomes)}`;
}

export function classeDaCelula({ terminados, nao_feitos }) {
  if (!terminados) return 'vazio';
  const taxa = nao_feitos / terminados;
  if (taxa === 0) return '0';
  if (taxa <= 0.25) return '1';
  return taxa <= 0.5 ? '2' : '3';
}

// Uma linha por tag de estudo (mãe) com as subtags; a mãe soma as horas das filhas.
export function horasPorTag(categories, blocosEstudo, semanas) {
  const estudo = tagsDeEstudo(categories);
  const cumprido = new Map();
  for (const b of blocosEstudo) if (b.status === 'done') cumprido.set(b.category_id, (cumprido.get(b.category_id) || 0) + duracao(b));
  const media = (min) => (semanas > 1 ? Math.round(min / semanas) : min);
  const linha = (c, min) => ({ id: c.id, nome: c.name, cor: c.color, cumprido_min: min, media_min: media(min), meta_min: c.meta_semanal_min ?? null });
  const visivel = (l, c) => l.cumprido_min > 0 || (!c.archived && l.meta_min);
  const porHoras = (x, y) => y.cumprido_min - x.cumprido_min || x.nome.localeCompare(y.nome, 'pt-BR');
  const topo = categories.filter((c) => estudo.has(c.id) && !(c.parent_id && estudo.has(c.parent_id)));
  return topo.map((m) => {
    const filhas = categories.filter((f) => f.parent_id === m.id && estudo.has(f.id))
      .map((f) => [f, linha(f, cumprido.get(f.id) || 0)]).filter(([f, l]) => visivel(l, f)).map(([, l]) => ({ ...l, filhas: [] })).sort(porHoras);
    const total = (cumprido.get(m.id) || 0) + categories.filter((f) => f.parent_id === m.id).reduce((s, f) => s + (cumprido.get(f.id) || 0), 0);
    return [m, { ...linha(m, total), filhas }];
  }).filter(([m, l]) => visivel(l, m) || l.filhas.length).map(([, l]) => l).sort(porHoras);
}

export function corDaMeta(cumpridoMin, metaMin) {
  const pct = cumpridoMin / metaMin;
  if (pct >= 1) return 'ok';
  return pct >= 0.5 ? 'meio' : 'baixo';
}

// Todos os blocos do card desde sempre; fixa sem data final conta só até o domingo desta semana.
export function horasDoCard(cardId, { commitments, blocks }, hoje) {
  const fixas = commitments.filter((c) => c.card_id === cardId);
  const datas = [...blocks.filter((b) => b.card_id === cardId).map((b) => b.date), ...fixas.map((c) => c.valid_from)];
  const r = { planejado_min: 0, cumprido_min: 0 };
  if (!datas.length) return r;
  const de = datas.reduce((x, y) => (y < x ? y : x));
  const fimSemana = somaDias(inicioDaSemana(hoje), 6);
  const ate = [fimSemana, ...blocks.filter((b) => b.card_id === cardId).map((b) => b.date)].reduce((x, y) => (y > x ? y : x));
  const virtuaisAte = (b) => !b.virtual || b.date <= fimSemana;
  for (const b of blocosDoPeriodo(fixas, blocks.filter((x) => x.card_id === cardId), de, ate)) {
    if (b.card_id !== cardId || !virtuaisAte(b)) continue;
    r.planejado_min += duracao(b);
    if (b.status === 'done') r.cumprido_min += duracao(b);
  }
  return r;
}

export function formatarHoras(min) {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60); const m = total % 60;
  return m ? `${h}h${doisDigitos(m)}` : `${h}h`;
}

// Semanas para a média: só os dias do período que já chegaram (até hoje); no mínimo 1.
export function semanasDoPeriodo(de, ate, hoje) {
  const fim = ate < hoje ? ate : hoje;
  const dias = fim < de ? 0 : diasEntre(de, fim) + 1;
  return Math.max(1, dias / 7);
}

// Sequência a partir dos dados do app: lê um ano; se a sequência ocupa a janela inteira, lê mais para trás.
export function sequenciaDosDados({ categories, commitments, blocks }, agora, minimo) {
  const estudo = tagsDeEstudo(categories);
  for (let janela = 366; ; janela *= 2) {
    const de = somaDias(agora.data, -janela);
    const n = sequencia(blocosDeEstudo(blocosDoPeriodo(commitments, blocks, de, agora.data), estudo), agora, minimo);
    const maisAntigo = blocks.reduce((x, b) => (b.date < x ? b.date : x), agora.data);
    if (n < janela || de <= maisAntigo) return n;
  }
}

// Horas de vários cards numa passada só (Quadro): agrupa os blocos e as fixas por card.
export function horasDosCards(cardIds, { commitments, blocks }, hoje) {
  const porCard = new Map(cardIds.map((id) => [id, { blocks: [], commitments: [] }]));
  for (const b of blocks) porCard.get(b.card_id)?.blocks.push(b);
  for (const c of commitments) porCard.get(c.card_id)?.commitments.push(c);
  return new Map([...porCard].map(([id, d]) => [id, horasDoCard(id, d, hoje)]));
}

const MAX_DIAS_INTERVALO = 5 * 366;

export function intervaloValido(de, ate) {
  if (ate < de) return 'A data final vem antes da inicial.';
  if (diasEntre(de, ate) + 1 > MAX_DIAS_INTERVALO) return 'Escolha um intervalo de até 5 anos.';
  return null;
}
