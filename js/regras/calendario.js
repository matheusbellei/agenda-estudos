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
        // Sem separação estudo/compromisso na tela: com card é estudo (conta no progresso do card).
        kind: c.card_id ? 'study' : 'commitment',
        card_id: c.card_id || null,
        lembrete_min: c.lembrete_min ?? null,
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

// Dois blocos que começam a menos disto um do outro ficam lado a lado (nunca um "dentro" do outro).
const MESMO_INICIO_MIN = 30;

// `a` contém `b` quando `b` começa pelo menos 30 min depois de `a` e termina até o fim de `a`.
const contem = (a, b) => a !== b && b.start_min - a.start_min >= MESMO_INICIO_MIN && b.end_min <= a.end_min;

// Geometria dos blocos de um dia, no estilo das agendas de e-mail:
// - quem contém outro é `fundo` e fica embaixo; o contido fica por cima com a largura inteira;
// - blocos que começam juntos (< 30 min) dividem a largura (`indice` de `total`);
// - blocos que se cruzam com inícios distantes ficam em cascata (`recuo` = nível, a tela converte em px).
// `camada` ordena a pilha: contido acima de quem o contém; na cascata, quem começa depois fica acima.
export function posicionar(blocosDoDia) {
  const saida = blocosDoDia.map((b) => ({
    ...b,
    fundo: blocosDoDia.some((x) => contem(b, x)),
    profundidade: blocosDoDia.filter((x) => contem(x, b)).length,
    recuo: 0, indice: 0, total: 1, camada: 0,
  }));
  const niveis = [...new Set(saida.map((b) => b.profundidade))].sort((a, b) => a - b);
  for (const nivel of niveis) {
    const doNivel = saida.filter((b) => b.profundidade === nivel)
      .sort((a, b) => a.start_min - b.start_min || b.end_min - a.end_min);
    // Grupos de blocos que se encadeiam no tempo; dentro do grupo, "linhas" de blocos que começam juntos.
    let linhas = [];
    let fimGrupo = -1;
    const fecharGrupo = () => {
      linhas.forEach((linha, n) => linha.blocos.forEach((b, k) => {
        b.recuo = linha.recuo; b.indice = k; b.total = linha.blocos.length; b.camada = nivel * 1000 + n * 10 + 1;
      }));
      linhas = [];
    };
    for (const b of doNivel) {
      if (linhas.length && b.start_min >= fimGrupo) fecharGrupo();
      const atual = linhas[linhas.length - 1];
      if (atual && b.start_min - atual.inicio < MESMO_INICIO_MIN) {
        atual.blocos.push(b); atual.fim = Math.max(atual.fim, b.end_min);
      } else {
        const cruzadas = linhas.filter((l) => l.inicio < b.end_min && l.fim > b.start_min);
        const recuo = cruzadas.length ? 1 + Math.max(...cruzadas.map((l) => l.recuo)) : 0;
        linhas.push({ inicio: b.start_min, fim: b.end_min, recuo, blocos: [b] });
      }
      fimGrupo = Math.max(fimGrupo, b.end_min);
    }
    fecharGrupo();
  }
  return saida.map(({ profundidade, ...b }) => b);
}

// Novo horário a partir de `ini` (ex.: toque no corpo de um bloco): uma hora, até o próximo bloco que comece
// depois de `ini` ou o fim do período. Blocos que começam antes ou em `ini` ficam por baixo e não contam.
export function inicioMaisUmaHora(ini, blocosDoDia, fim) {
  const proximo = blocosDoDia.filter((b) => b.start_min > ini).reduce((m, b) => Math.min(m, b.start_min), Infinity);
  const end = Math.min(ini + 60, proximo, fim, 1440);
  return end > ini ? { start_min: ini, end_min: end } : null;
}

export function ajustarAFatia(min, fatia) {
  return Math.min(1440, Math.max(0, Math.round(min / fatia) * fatia));
}
