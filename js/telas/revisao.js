// Revisão da semana: números, metas, o que ficou para trás e mandar pendências para a fila.
import { registrarTela } from './casca.js';
import { somaDias, rotuloSemana } from '../regras/datas.js';
import { resumo, situacao, mapaNaoFeito, piorHorario, semanaDaRevisao, formatarHoras } from '../regras/acompanhamento.js';
import { agoraDoApp, estudoEntre, sequenciaAtual, metrica, linhasDeTags, itensNaoFeitos } from './dashboards.js';
import { mudarEstado } from './bloco.js';

function criar(tag, atributos = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'class') el.className = v;
    else if (k === 'texto') el.textContent = v;
    else el.setAttribute(k, v);
  }
  el.append(...filhos);
  return el;
}

export function iniciarRevisao({ estado }) {
  const secao = document.querySelector('#tela-revisao');
  let segunda = null;
  let ocupado = false;

  const anterior = criar('button', { type: 'button', class: 'btn-icone', id: 'rev-anterior', 'aria-label': 'Semana anterior' }, criar('i', { class: 'ti ti-chevron-left', 'aria-hidden': 'true' }));
  const proximo = criar('button', { type: 'button', class: 'btn-icone', id: 'rev-proximo', 'aria-label': 'Próxima semana' }, criar('i', { class: 'ti ti-chevron-right', 'aria-hidden': 'true' }));
  const rotulo = criar('span', { id: 'rev-rotulo', class: 'dash-rotulo' });
  const numeros = criar('div', { class: 'dash-numeros' });
  const metas = criar('div', { id: 'rev-metas' });
  const resumoEl = criar('p', { id: 'rev-resumo' });
  const lista = criar('ul', { id: 'rev-lista', class: 'dash-lista' });
  const fila = criar('button', { type: 'button', class: 'btn btn-principal', id: 'rev-fila' });
  const erro = criar('div', { class: 'erro', id: 'rev-erro', role: 'alert' });
  secao.replaceChildren(
    criar('div', { class: 'dash-nav' }, anterior, rotulo, proximo),
    numeros,
    criar('div', { class: 'cartao' }, criar('h3', { texto: 'Metas da semana' }), metas),
    criar('div', { class: 'cartao' }, criar('h3', { texto: 'O que ficou para trás' }), resumoEl, lista, fila, erro));

  const padrao = () => semanaDaRevisao(agoraDoApp(estado), estado.ajustes());
  let pendentes = [];

  function desenhar() {
    const agora = agoraDoApp(estado);
    const ultima = padrao();
    if (!segunda || segunda > ultima) segunda = ultima;
    const domingo = somaDias(segunda, 6);
    rotulo.textContent = rotuloSemana([segunda, domingo]);
    proximo.hidden = segunda >= ultima;
    const estudo = estudoEntre(estado, segunda, domingo);
    const r = resumo(estudo, agora);
    const dias = sequenciaAtual(estado, agora);
    numeros.replaceChildren(
      metrica('rev-cumprido', 'Estudo cumprido', formatarHoras(r.cumprido_min), `de ${formatarHoras(r.planejado_min)} planejadas`),
      metrica('rev-sequencia', 'Sequência', `${dias} ${dias === 1 ? 'dia' : 'dias'}`, `mín. ${formatarHoras(estado.ajustes().sequencia_min)}/dia`),
      metrica('rev-pct', 'Cumprido', r.pct === null ? '—' : `${r.pct}%`, 'dos blocos'));
    const linhas = linhasDeTags(estado.dados.categories, estudo, 1);
    metas.replaceChildren(...(linhas.length ? linhas : [criar('p', { class: 'suave', texto: 'Nenhuma hora cumprida nem meta nesta semana.' })]));
    const pior = piorHorario(mapaNaoFeito(estudo, agora));
    resumoEl.textContent = r.nao_feitos
      ? [`${r.nao_feitos} ${r.nao_feitos === 1 ? 'não feito' : 'não feitos'}`, formatarHoras(r.nao_feito_min), ...(pior ? [pior] : [])].join(' · ')
      : 'Nada ficou para trás.';
    lista.replaceChildren(...itensNaoFeitos(estado, estudo, agora, 'rev-item'));
    pendentes = estudo.filter((b) => situacao(b, agora) === 'sem_marcar');
    fila.hidden = !pendentes.length;
    fila.textContent = `Mandar pendências para a fila (${pendentes.length})`;
  }

  anterior.addEventListener('click', () => { segunda = somaDias(segunda, -7); desenhar(); });
  proximo.addEventListener('click', () => { segunda = somaDias(segunda, 7); desenhar(); });
  fila.addEventListener('click', async () => {
    if (ocupado || !pendentes.length) return;
    const n = pendentes.length;
    if (!window.confirm(`Marcar ${n} ${n === 1 ? 'bloco sem marcar como não feito' : 'blocos sem marcar como não feitos'}? Os que têm card vão para "Para encaixar".`)) return;
    ocupado = true; erro.textContent = '';
    try {
      for (const b of [...pendentes]) await mudarEstado(estado, b, 'missed');
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível marcar todos. Tente de novo.';
    } finally {
      ocupado = false;
      desenhar();
    }
  });

  // Ao abrir pelo menu ou pelo aviso, volta para a semana padrão.
  registrarTela('revisao', { mostrar: () => { segunda = null; desenhar(); } });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
