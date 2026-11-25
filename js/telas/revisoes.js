// "Agendar revisão" de um card: padrão (dias das Configurações) ou datas escolhidas. Datas fixas.
import { criar } from './bloco.js';
import { abrirJanela } from './janela.js';
import { agoraNoFuso } from '../regras/lembretes.js';
import { datasDoPadrao, validarDatas, textoDoPadrao } from '../regras/revisoes.js';


export function hojeDoApp(estado) {
  return agoraNoFuso(Date.now(), estado.ajustes().fuso).data;
}

export function abrirAgendarRevisao(estado, cardId) {
  const hoje = hojeDoApp(estado);
  const dias = estado.ajustes().revisoes_dias;
  const padrao = datasDoPadrao(hoje, dias);
  const opcao = (id, valor, rotulo, marcado) => {
    const r = criar('input', { type: 'radio', name: 'revisao-modo', id, value: valor });
    r.checked = marcado;
    return [r, criar('label', { class: 'campo-check', for: id }, r, criar('span', { texto: rotulo }))];
  };
  const [rPadrao, lPadrao] = opcao('revisao-padrao', 'padrao', textoDoPadrao(dias, padrao), true);
  const [rPers, lPers] = opcao('revisao-personalizar', 'personalizar', 'Escolher outras datas', false);
  const lista = criar('div', { id: 'revisao-datas', class: 'revisao-datas', hidden: '' });
  const mais = criar('button', { type: 'button', class: 'btn', id: 'revisao-mais', texto: 'Acrescentar data', hidden: '' });
  const erro = criar('div', { class: 'erro', id: 'revisao-erro', role: 'alert' });
  const agendar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'revisao-agendar', texto: 'Agendar' });
  const cancelar = criar('button', { type: 'button', class: 'btn', texto: 'Cancelar' });

  const linha = (valor) => {
    const campo = criar('input', { type: 'date', min: hoje, 'aria-label': 'Data da revisão' });
    campo.value = valor;
    const tirar = criar('button', { type: 'button', class: 'btn-icone revisao-tirar', 'aria-label': 'Tirar esta data' }, criar('i', { class: 'ti ti-x', 'aria-hidden': 'true' }));
    const el = criar('div', { class: 'revisao-linha' }, campo, tirar);
    tirar.addEventListener('click', () => el.remove());
    return el;
  };
  lista.append(...padrao.map(linha));
  const trocar = () => { const p = rPers.checked; lista.hidden = !p; mais.hidden = !p; erro.textContent = ''; };
  rPadrao.addEventListener('change', trocar);
  rPers.addEventListener('change', trocar);
  mais.addEventListener('click', () => lista.append(linha('')));

  const { fechar } = abrirJanela('revisao-janela', 'Revisões espaçadas',
    criar('p', { class: 'suave', texto: 'Cada revisão aparece em "Para encaixar" no dia marcado. Se atrasar uma, as outras continuam nas datas delas.' }),
    lPadrao, lPers, lista, mais, erro, criar('div', { class: 'linha-botoes' }, agendar, cancelar));
  cancelar.addEventListener('click', fechar);

  let ocupado = false;
  agendar.addEventListener('click', async () => {
    if (ocupado) return;
    const datas = rPers.checked ? [...lista.querySelectorAll('input[type=date]')].map((i) => i.value) : padrao;
    const problema = validarDatas(datas, hoje);
    if (problema) { erro.textContent = problema; return; }
    const pendentes = estado.dados.revisoes.filter((r) => r.card_id === cardId && r.status === 'pendente');
    if (pendentes.length && !window.confirm('Este card já tem revisões marcadas. Substituir as que faltam?')) return;
    ocupado = true; agendar.disabled = true; erro.textContent = '';
    try {
      await cancelarLista(estado, pendentes);
      for (const data of [...datas].sort()) await estado.criar('revisoes', { card_id: cardId, data, status: 'pendente' });
      fechar();
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível agendar.';
    } finally { ocupado = false; agendar.disabled = false; }
  });
}

// Cancela revisões e tira da agenda as sessões delas ainda planejadas (as cumpridas e não feitas ficam como histórico).
async function cancelarLista(estado, revisoes) {
  const ids = new Set(revisoes.map((r) => r.id));
  for (const r of revisoes) await estado.alterar('revisoes', r.id, { status: 'cancelada' });
  const sessoes = estado.dados.blocks.filter((b) => ids.has(b.revisao_id) && b.status === 'planned');
  for (const b of sessoes) await estado.excluir('blocks', b.id);
}

// Cancela as revisões que ainda faltam de um card (as feitas ficam).
export async function cancelarRevisoes(estado, cardId) {
  const pendentes = estado.dados.revisoes.filter((r) => r.card_id === cardId && r.status === 'pendente');
  const n = pendentes.length;
  if (!n || !window.confirm(`Cancelar ${n === 1 ? 'a revisão que falta' : `as ${n} revisões que faltam`}? Sessões já marcadas na agenda para elas saem junto.`)) return;
  await cancelarLista(estado, pendentes);
}
