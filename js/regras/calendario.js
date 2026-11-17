import { somaDias, diaDaSemana } from './datas.js';

export function ocorrenciasDeCompromissos(commitments, de, ate) {
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
        kind: 'commitment',
        title: c.title,
        category_id: c.category_id,
        status: 'planned',
        instead_note: '',
      });
    }
  }
  return saida;
}

export function blocosDoPeriodo(commitments, blocks, de, ate) {
  const noPeriodo = blocks.filter((b) => b.date >= de && b.date <= ate);
  // Qualquer bloco gravado de um compromisso (inclusive cancelado) sobrepõe a ocorrência virtual do dia.
  const gravados = new Set(noPeriodo.filter((b) => b.commitment_id).map((b) => `${b.commitment_id}|${b.date}`));
  const virtuais = ocorrenciasDeCompromissos(commitments, de, ate)
    .filter((v) => !gravados.has(`${v.commitment_id}|${v.date}`));
  return [...noPeriodo.filter((b) => !b.cancelled), ...virtuais]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.start_min - b.start_min));
}

export function horariosLivres(blocosDoDia, inicio, fim) {
  const ordenados = [...blocosDoDia].sort((a, b) => a.start_min - b.start_min);
  const livres = [];
  let cursor = inicio;
  for (const b of ordenados) {
    if (b.start_min > cursor) livres.push({ start_min: cursor, end_min: Math.min(b.start_min, fim) });
    cursor = Math.max(cursor, b.end_min);
    if (cursor >= fim) break;
  }
  if (cursor < fim) livres.push({ start_min: cursor, end_min: fim });
  return livres.filter((l) => l.end_min > l.start_min);
}

export function faixasDaSemana(blocosDoDia, inicio, fim, faixa) {
  const faixas = [];
  for (let ini = inicio; ini < fim; ini += faixa) {
    const end = Math.min(ini + faixa, fim);
    const blocos = blocosDoDia.filter((b) => b.start_min < end && b.end_min > ini);
    const livre_min = horariosLivres(blocos, ini, end).reduce((s, l) => s + l.end_min - l.start_min, 0);
    faixas.push({ start_min: ini, end_min: end, blocos, livre_min });
  }
  return faixas;
}

export function limitesDoDia(blocosDoDia, inicio, fim) {
  return {
    inicio: Math.min(inicio, ...blocosDoDia.map((b) => b.start_min)),
    fim: Math.max(fim, ...blocosDoDia.map((b) => b.end_min)),
  };
}

// Agrupa blocos que se encadeiam por sobreposição; dentro do grupo cada bloco ocupa a primeira coluna livre.
export function colunas(blocosDoDia) {
  const ordenados = [...blocosDoDia].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
  const saida = [];
  let grupo = [];
  let fimGrupo = -1;
  const fechar = () => {
    const cols = grupo.reduce((m, b) => Math.max(m, b.col + 1), 1);
    for (const b of grupo) saida.push({ ...b, cols });
    grupo = [];
  };
  for (const b of ordenados) {
    if (grupo.length && b.start_min >= fimGrupo) fechar();
    const usadas = new Set(grupo.filter((g) => g.end_min > b.start_min).map((g) => g.col));
    let col = 0;
    while (usadas.has(col)) col++;
    grupo.push({ ...b, col });
    fimGrupo = Math.max(fimGrupo, b.end_min);
  }
  fechar();
  return saida;
}

export function ajustarAFatia(min, fatia) {
  return Math.min(1440, Math.max(0, Math.round(min / fatia) * fatia));
}
