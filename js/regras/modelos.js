// Modelos de semana: guardar os blocos de uma semana e recriá-los em outra, de hoje em diante.
import { somaDias, diaDaSemana } from './datas.js';
import { blocosDoPeriodo } from './calendario.js';

const CAMPOS = (b) => ({
  start_min: b.start_min, end_min: b.end_min, kind: b.kind, title: b.title || '', category_id: b.category_id ?? null,
  card_id: b.card_id ?? null, item_id: b.item_id ?? null, lembrete_min: b.lembrete_min ?? null,
});

// Blocos da semana viram itens do modelo. Vínculos que só valem naquela semana (revisão, fixa de card) ficam de fora;
// as ocorrências dos compromissos fixos só entram se `comFixas`.
export function itensDoModelo({ blocks, commitments }, segunda, comFixas) {
  const domingo = somaDias(segunda, 6);
  return blocosDoPeriodo(commitments, blocks, segunda, domingo)
    .filter((b) => !b.cancelled && (comFixas || !b.commitment_id))
    .sort((a, b) => (a.date === b.date ? a.start_min - b.start_min : a.date.localeCompare(b.date)))
    .map((b) => ({ dia: diaDaSemana(b.date), ...CAMPOS(b), commitment_id: b.commitment_id ?? null }));
}

const fixaVale = (commitment, data) => !!commitment && blocosDoPeriodo([commitment], [], data, data).length > 0;

// O que sai e o que entra ao aplicar um modelo na semana de `segunda`. Os dias antes de hoje não mudam.
export function planoDeAplicacao({ itens, dados, segunda, hoje, manterCumpridos, manterNaoFeitos }) {
  const domingo = somaDias(segunda, 6);
  const contagem = { planejados: 0, cumpridos: 0, nao_feitos: 0 };
  const remover = [];
  for (const b of dados.blocks) {
    if (b.cancelled || b.date < segunda || b.date > domingo || b.date < hoje) continue;
    if (b.status === 'done' && manterCumpridos) continue;
    if (b.status === 'missed' && manterNaoFeitos) continue;
    remover.push(b.id);
    contagem[b.status === 'done' ? 'cumpridos' : b.status === 'missed' ? 'nao_feitos' : 'planejados'] += 1;
  }
  const existe = (tabela, id) => id && dados[tabela].some((x) => x.id === id);
  const criar = [];
  for (const it of itens) {
    const date = somaDias(segunda, it.dia - 1);
    if (date < hoje) continue;
    if (it.commitment_id && fixaVale(dados.commitments.find((c) => c.id === it.commitment_id), date)) continue;
    const card = existe('cards', it.card_id) ? it.card_id : null;
    const item = card && dados.items.some((i) => i.id === it.item_id && i.card_id === card) ? it.item_id : null;
    criar.push({
      date, start_min: it.start_min, end_min: it.end_min, kind: card ? 'study' : 'commitment', title: it.title || '',
      category_id: existe('categories', it.category_id) ? it.category_id : null, card_id: card, item_id: item,
      lembrete_min: it.lembrete_min ?? null, status: 'planned',
    });
  }
  return { remover, criar, contagem };
}

const juntar = (l) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`);

export function textoDaContagem({ planejados, cumpridos, nao_feitos }) {
  const partes = [];
  if (planejados) partes.push(`${planejados} ${planejados === 1 ? 'planejado' : 'planejados'}`);
  if (cumpridos) partes.push(`${cumpridos} ${cumpridos === 1 ? 'cumprido' : 'cumpridos'}`);
  if (nao_feitos) partes.push(`${nao_feitos} ${nao_feitos === 1 ? 'não feito' : 'não feitos'}`);
  const total = planejados + cumpridos + nao_feitos;
  if (!total) return 'Nenhum bloco sai.';
  return `${total === 1 ? 'Sai' : 'Saem'} ${juntar(partes)}.`;
}
