// Modo foco (Pomodoro): fases, tempo que falta e o aviso do fim de cada fase.
// Regra pura: roda no app e na função "lembretes". O tempo vem sempre de "termina_em" e do relógio,
// nunca de um contador local, para o foco sobreviver a fechar o app.
import { agoraNoFuso, emSilencio } from './lembretes.js';

const TOLERANCIA_MS = 2 * 60000;

export function proximaFase({ fase, ciclo }, ajustes) {
  if (fase !== 'foco') return { fase: 'foco', ciclo: ciclo + 1 };
  return { fase: ciclo % ajustes.ciclos_longa === 0 ? 'pausa_longa' : 'pausa', ciclo };
}

export function duracaoS(fase, ajustes) {
  const min = fase === 'foco' ? ajustes.foco_min : fase === 'pausa' ? ajustes.pausa_min : ajustes.pausa_longa_min;
  return min * 60;
}

export function restanteS(foco, agoraMs) {
  if (foco.estado === 'pausado') return foco.restante_s ?? 0;
  if (foco.estado !== 'rodando' || !foco.termina_em) return 0;
  return Math.max(0, Math.ceil((Date.parse(foco.termina_em) - agoraMs) / 1000));
}

export function iniciarFase(fase, ciclo, agoraMs, ajustes) {
  return { fase, ciclo, estado: 'rodando', termina_em: new Date(agoraMs + duracaoS(fase, ajustes) * 1000).toISOString(), restante_s: null };
}

export function pausar(foco, agoraMs) {
  return { ...foco, estado: 'pausado', restante_s: restanteS(foco, agoraMs), termina_em: null };
}

export function retomar(foco, agoraMs) {
  return { ...foco, estado: 'rodando', termina_em: new Date(agoraMs + (foco.restante_s ?? 0) * 1000).toISOString(), restante_s: null };
}

export function textoDoFim(foco, ajustes) {
  const titulo = (foco.titulo || '').trim() || 'Modo foco';
  if (foco.fase === 'foco') {
    const longa = proximaFase(foco, ajustes).fase === 'pausa_longa';
    const pos = ((foco.ciclo - 1) % ajustes.ciclos_longa) + 1;
    return { titulo, botao: 'Começar pausa',
      corpo: `Foco concluído (ciclo ${pos} de ${ajustes.ciclos_longa}). Hora da pausa${longa ? ' longa' : ''} de ${longa ? ajustes.pausa_longa_min : ajustes.pausa_min} min.` };
  }
  if (foco.fase === 'pausa') return { titulo, botao: 'Começar foco', corpo: `Pausa terminada. Pronto para o foco ${foco.ciclo + 1}?` };
  return { titulo, botao: 'Começar foco', corpo: 'Pausa longa terminada. Começar um novo ciclo?' };
}

// No tique da função: a fase venceu? Avisa (uma vez, fora do silêncio, até 2 min depois) e passa a "esperando".
export function focoNoTique({ foco, instanteMs, fuso, ajustes, enviadas = new Set() }) {
  if (!foco || foco.estado !== 'rodando' || !foco.termina_em) return { aviso: null, esperando: false };
  const fim = Date.parse(foco.termina_em);
  if (fim > instanteMs) return { aviso: null, esperando: false };
  const chave = `foco:${foco.owner_id}:${foco.termina_em}`;
  const recente = fim > instanteMs - TOLERANCIA_MS;
  const silencio = emSilencio(agoraNoFuso(fim, fuso).minuto, ajustes);
  if (!recente || silencio || enviadas.has(chave)) return { aviso: null, esperando: true };
  return { aviso: { chave, ...textoDoFim(foco, ajustes) }, esperando: true };
}
