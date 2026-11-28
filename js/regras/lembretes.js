// O que notificar num dado instante: lembrete antes do bloco, adiados, resumo da manhã e pendências da noite.
// Regra pura: roda no app (testes) e na função "lembretes" do Supabase, que a recebe pronta em index.ts.
import { horaTexto, diaDaSemana } from './datas.js';

// O agendador pode atrasar ou pular minutos: o que venceu nos últimos 5 minutos e ainda não foi enviado sai
// (atrasado, mas sai; o texto diz quanto falta de verdade).
const TOLERANCIA_MIN = 5;
const MAX_ITENS_RESUMO = 4;

export function agoraNoFuso(instanteMs, fuso) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instanteMs)).map((p) => [p.type, p.value]));
  return { data: `${partes.year}-${partes.month}-${partes.day}`, minuto: Number(partes.hour) * 60 + Number(partes.minute) };
}

// Início incluso, fim não incluso; de > até atravessa a meia-noite (22:00–07:00).
export function emSilencio(minuto, ajustes) {
  if (!ajustes.notif_silencio) return false;
  const de = ajustes.notif_silencio_de;
  const ate = ajustes.notif_silencio_ate;
  return de <= ate ? minuto >= de && minuto < ate : minuto >= de || minuto < ate;
}

// Identifica o bloco nas chaves e nas ações: id do bloco gravado, ou "v:<fixa>" para a ocorrência virtual.
export function refDoBloco(b) {
  return b.virtual ? `v:${b.commitment_id}` : b.id;
}

const vence = (alvo, minuto) => alvo <= minuto && alvo > minuto - TOLERANCIA_MIN;
const titulo = (b) => b.title || 'Bloco';
const porInicio = (a, b) => a.start_min - b.start_min;

// `blocos`: hoje e amanhã (com ocorrências das fixas), cada um com date, start_min, end_min, status e lembrete_min.
export function devidos({ instanteMs, fuso, ajustes, blocos, adiamentos = [], enviadas = new Set() }) {
  const { data: hoje, minuto } = agoraNoFuso(instanteMs, fuso);
  const saida = [];
  const pode = (chave, alvo) => !enviadas.has(chave) && !emSilencio(((alvo % 1440) + 1440) % 1440, ajustes);
  const planejados = blocos.filter((b) => b.status === 'planned');

  for (const b of planejados) {
    const antes = b.lembrete_min ?? ajustes.notif_antes_min;
    if (antes == null || antes < 0) continue;
    const base = b.date === hoje ? 0 : b.date > hoje ? 1440 : -1440;
    const alvo = base + b.start_min - antes;
    const chave = `antes:${refDoBloco(b)}:${b.date}:${b.start_min}`;
    if (!vence(alvo, minuto) || !pode(chave, alvo)) continue;
    const falta = base + b.start_min - minuto;
    saida.push({
      chave, tipo: 'antes', titulo: titulo(b), ref: refDoBloco(b), data: b.date, acoes: ['cumprir', 'adiar'],
      corpo: falta > 0 ? `Começa às ${horaTexto(b.start_min)} (em ${falta} min)` : falta === 0 ? 'Começa agora' : `Começou às ${horaTexto(b.start_min)}`,
    });
  }

  for (const a of adiamentos) {
    const quando = Date.parse(a.quando);
    if (!(quando <= instanteMs && quando > instanteMs - TOLERANCIA_MIN * 60000)) continue;
    const b = planejados.find((x) => refDoBloco(x) === a.ref && x.date === a.data);
    const chave = `adiado:${a.ref}:${a.data}:${a.quando}`;
    if (!b || !pode(chave, minuto)) continue;
    saida.push({ chave, tipo: 'adiado', titulo: titulo(b), ref: a.ref, data: a.data, acoes: ['cumprir', 'adiar'],
      corpo: `Começa às ${horaTexto(b.start_min)} (lembrete adiado)` });
  }

  const doDia = blocos.filter((b) => b.date === hoje).sort(porInicio);
  if (ajustes.notif_resumo && doDia.length && vence(ajustes.notif_resumo_min, minuto) && pode(`resumo:${hoje}`, ajustes.notif_resumo_min)) {
    const itens = doDia.slice(0, MAX_ITENS_RESUMO).map((b) => `${horaTexto(b.start_min)} ${titulo(b)}`).join(' · ');
    const resto = doDia.length - MAX_ITENS_RESUMO;
    saida.push({ chave: `resumo:${hoje}`, tipo: 'resumo', titulo: 'Hoje', data: hoje, acoes: [], corpo: resto > 0 ? `${itens} e mais ${resto}` : itens });
  }

  const pendentes = doDia.filter((b) => b.status === 'planned' && b.end_min <= minuto);
  if (ajustes.notif_pendencias && pendentes.length && vence(ajustes.notif_pendencias_min, minuto)
    && pode(`pendencias:${hoje}`, ajustes.notif_pendencias_min)) {
    const n = pendentes.length;
    saida.push({ chave: `pendencias:${hoje}`, tipo: 'pendencias', titulo: 'Faltou marcar', data: hoje, acoes: [],
      corpo: `${n} ${n === 1 ? 'bloco' : 'blocos'} de hoje sem marcar: ${pendentes.map(titulo).join(', ')}` });
  }
  return saida;
}

// Aviso dos flashcards do dia: no horário escolhido, uma vez por dia, fora do silêncio (se houver algo, decide o serviço).
export function flashVence({ instanteMs, fuso, ajustes, enviadas = new Set() }) {
  if (!ajustes.flash_aviso) return null;
  const { data, minuto } = agoraNoFuso(instanteMs, fuso);
  const chave = `flash:${data}`;
  if (!vence(ajustes.flash_aviso_min, minuto) || enviadas.has(chave) || emSilencio(ajustes.flash_aviso_min, ajustes)) return null;
  return { chave, data };
}
