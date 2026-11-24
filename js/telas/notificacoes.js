// Painel "Notificações" das Configurações: este aparelho (ativar, desativar, teste), outros aparelhos
// e as preferências (lembrete padrão, resumo da manhã, pendências da noite, silêncio).
import { horaTexto, minutosDe } from '../regras/datas.js';
import * as aparelho from '../notificacoes.js';
import { emSilencio } from '../regras/lembretes.js';

export const OPCOES_LEMBRETE = [[-1, 'Nenhum'], [0, 'Na hora'], [5, '5 min antes'], [10, '10 min antes'], [15, '15 min antes'], [30, '30 min antes'], [60, '1 hora antes']];

export function textoDoLembrete(min) {
  const o = OPCOES_LEMBRETE.find(([v]) => v === min);
  return o ? o[1] : `${min} min antes`;
}

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

const campo = (rotulo, controle) => criar('label', { class: 'campo' }, criar('span', { texto: rotulo }), controle);
const caixa = (id, rotulo) => {
  const c = criar('input', { type: 'checkbox', id });
  return { c, el: criar('label', { class: 'repetir' }, c, criar('span', { texto: rotulo })) };
};
const hora = (id) => criar('input', { type: 'time', id, step: '60' });

const TEXTO_ESTADO = {
  'sem-suporte': 'Este navegador não recebe notificações do app. No celular, instale o app pelo Chrome (menu ⋮ → Instalar app) e abra por ele.',
  'sem-chave': 'Falta a chave pública das notificações: preencha VAPID_PUBLIC_KEY no js/config.js (passo a passo no README).',
  bloqueado: 'As notificações deste site estão bloqueadas no navegador. Libere em Configurações do site → Notificações e volte aqui.',
  ativado: 'Ativado neste aparelho.',
  desativado: 'Desativado neste aparelho.',
};

export function montarPainelNotificacoes({ estado, store }) {
  const estadoTexto = criar('p', { id: 'notif-aparelho-estado', class: 'notif-estado' });
  const ativar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'notif-ativar', texto: 'Ativar neste aparelho' });
  const desativar = criar('button', { type: 'button', class: 'btn', id: 'notif-desativar', texto: 'Desativar neste aparelho' });
  const teste = criar('button', { type: 'button', class: 'btn', id: 'notif-teste', texto: 'Enviar teste' });
  const erro = criar('div', { class: 'erro', id: 'notif-erro', role: 'alert' });
  const msg = criar('div', { class: 'suave', id: 'notif-msg', role: 'status' });
  const lista = criar('ul', { id: 'notif-aparelhos', class: 'notif-aparelhos' });

  const antes = criar('select', { id: 'notif-antes' }, ...OPCOES_LEMBRETE.map(([v, t]) => criar('option', { value: String(v), texto: t })));
  const resumo = caixa('notif-resumo', 'Resumo da manhã');
  const resumoHora = hora('notif-resumo-hora');
  const pend = caixa('notif-pendencias', 'Pendências da noite');
  const pendHora = hora('notif-pendencias-hora');
  const silencio = caixa('notif-silencio', 'Horário de silêncio');
  const silDe = hora('notif-silencio-de');
  const silAte = hora('notif-silencio-ate');
  const camposSilencio = criar('div', { class: 'linha-campos' }, campo('De', silDe), campo('Até', silAte));
  const flash = caixa('notif-flash', 'Flashcards do dia');
  const flashHora = hora('notif-flash-hora');
  const camposFlash = criar('div', { class: 'linha-campos' }, campo('Horário', flashHora));
  const revisao = caixa('notif-revisao', 'Revisão da semana');
  const revisaoDia = criar('select', { id: 'notif-revisao-dia' },
    ...['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'].map((t, i) => criar('option', { value: String(i + 1), texto: t })));
  const revisaoHora = hora('notif-revisao-hora');
  const camposRevisao = criar('div', { class: 'linha-campos' }, campo('Dia', revisaoDia), campo('Horário', revisaoHora));
  const revisaoNoSilencio = criar('p', { class: 'erro', id: 'notif-revisao-no-silencio', hidden: '',
    texto: 'Este horário cai no horário de silêncio: o aviso da revisão não vai chegar. Escolha outro horário ou mude o silêncio.' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'notif-salvar', texto: 'Salvar' });
  const erroPrefs = criar('div', { class: 'erro', id: 'notif-prefs-erro', role: 'alert' });
  const msgPrefs = criar('div', { class: 'suave', id: 'notif-prefs-msg', role: 'status' });

  const el = criar('div', { id: 'aj-notificacoes', class: 'aj-painel' },
    criar('div', { class: 'cartao', id: 'notif-este' },
      criar('h2', { texto: 'Este aparelho' }),
      criar('p', { class: 'suave', texto: 'Ative em cada aparelho onde quer receber os avisos (celular e computador). Funciona com o app fechado.' }),
      estadoTexto, criar('div', { class: 'linha-botoes' }, ativar, desativar, teste), erro, msg,
      criar('h3', { class: 'sub', texto: 'Aparelhos ativos' }), lista),
    criar('div', { class: 'cartao', id: 'notif-prefs' },
      criar('h2', { texto: 'O que avisar' }),
      campo('Lembrete antes do bloco (padrão)', antes),
      criar('p', { class: 'suave', texto: 'Cada bloco pode ter o seu, no campo Lembrete do formulário.' }),
      resumo.el, criar('div', { class: 'notif-sub' }, campo('Horário do resumo', resumoHora),
        criar('p', { class: 'suave', texto: 'O que tem no dia, numa notificação.' })),
      pend.el, criar('div', { class: 'notif-sub' }, campo('Horário das pendências', pendHora),
        criar('p', { class: 'suave', texto: 'Blocos do dia já terminados e ainda sem marcar como cumprido ou não feito.' })),
      flash.el, criar('div', { class: 'notif-sub' }, camposFlash,
        criar('p', { class: 'suave', texto: 'Quantos flashcards há para hoje (baralhos e cards), se houver algum.' })),
      revisao.el, criar('div', { class: 'notif-sub' }, camposRevisao,
        criar('p', { class: 'suave', texto: 'As horas da semana e um toque para abrir a revisão.' }),
        revisaoNoSilencio),
      silencio.el,
      criar('p', { class: 'notif-aviso', id: 'notif-silencio-aviso', texto: 'Com o silêncio ligado, você não recebe nenhum aviso nesse intervalo — nem lembretes, nem resumo, nem pendências, nem a revisão da semana, nem os flashcards do dia, nem o fim de fase do foco. O que cair nele é descartado, não chega depois.' }),
      criar('div', { class: 'notif-sub' }, camposSilencio),
      erroPrefs, msgPrefs, criar('div', { class: 'linha-botoes' }, salvar)));

  let atual = { estado: 'desativado' };
  let ocupado = false;

  function preencherPrefs() {
    const a = estado.ajustes();
    antes.value = String(a.notif_antes_min);
    resumo.c.checked = a.notif_resumo; resumoHora.value = horaTexto(a.notif_resumo_min);
    pend.c.checked = a.notif_pendencias; pendHora.value = horaTexto(a.notif_pendencias_min);
    flash.c.checked = a.flash_aviso; flashHora.value = horaTexto(a.flash_aviso_min);
    revisao.c.checked = a.revisao; revisaoDia.value = String(a.revisao_dia); revisaoHora.value = horaTexto(a.revisao_min);
    silencio.c.checked = a.notif_silencio; silDe.value = horaTexto(a.notif_silencio_de); silAte.value = horaTexto(a.notif_silencio_ate);
    atualizarVisibilidade();
  }
  function atualizarVisibilidade() {
    resumoHora.closest('.notif-sub').hidden = !resumo.c.checked;
    pendHora.closest('.notif-sub').hidden = !pend.c.checked;
    camposSilencio.closest('.notif-sub').hidden = !silencio.c.checked;
    camposRevisao.closest('.notif-sub').hidden = !revisao.c.checked;
    camposFlash.closest('.notif-sub').hidden = !flash.c.checked;
    const rev = minutosDe(revisaoHora.value || '');
    const de = minutosDe(silDe.value || ''); const ate = minutosDe(silAte.value || '');
    revisaoNoSilencio.hidden = !(revisao.c.checked && silencio.c.checked && [rev, de, ate].every(Number.isFinite)
      && emSilencio(rev, { notif_silencio: true, notif_silencio_de: de, notif_silencio_ate: ate }));
  }
  [revisaoHora, silDe, silAte].forEach((i) => { i.addEventListener('input', atualizarVisibilidade); i.addEventListener('change', atualizarVisibilidade); });
  [resumo.c, pend.c, silencio.c, revisao.c, flash.c].forEach((c) => c.addEventListener('change', atualizarVisibilidade));

  async function desenharAparelho() {
    let linhas = [];
    try { linhas = await aparelho.aparelhos(store); } catch (err) { erro.textContent = err.message; }
    try { atual = await aparelho.estadoDoAparelho(store, linhas); } catch (err) { atual = { estado: 'desativado' }; erro.textContent = err.message; }
    estadoTexto.textContent = TEXTO_ESTADO[atual.estado];
    estadoTexto.dataset.estado = atual.estado;
    ativar.hidden = atual.estado !== 'desativado';
    desativar.hidden = atual.estado !== 'ativado';
    teste.hidden = atual.estado !== 'ativado';
    lista.replaceChildren(...(linhas.length ? linhas.map((l) => {
      const remover = criar('button', { type: 'button', class: 'btn btn-mini notif-remover', texto: 'Remover', 'aria-label': `Remover ${l.aparelho || 'aparelho'}` });
      remover.addEventListener('click', () => agir(async () => { await aparelho.remover(store, l.id); }));
      const deste = atual.linha?.id === l.id;
      return criar('li', { 'data-sub': l.id }, criar('span', { texto: `${l.aparelho || 'Aparelho'}${deste ? ' (este)' : ''}` }), remover);
    }) : [criar('li', { class: 'suave', texto: 'Nenhum aparelho ativado.' })]));
  }

  async function agir(fn, sucesso = '') {
    if (ocupado) return;
    ocupado = true; erro.textContent = ''; msg.textContent = '';
    try { await fn(); msg.textContent = sucesso; } catch (err) { erro.textContent = err.message || 'Não foi possível concluir.'; }
    finally { ocupado = false; await desenharAparelho(); }
  }

  ativar.addEventListener('click', () => agir(() => aparelho.ativar(store), 'Pronto: este aparelho vai receber os avisos.'));
  desativar.addEventListener('click', () => agir(() => aparelho.desativar(store), 'Desativado neste aparelho.'));
  teste.addEventListener('click', () => agir(() => aparelho.enviarTeste(store, atual.endpoint), 'Enviado. A notificação deve chegar em alguns segundos.'));

  salvar.addEventListener('click', async () => {
    erroPrefs.textContent = ''; msgPrefs.textContent = '';
    const mins = [resumoHora, pendHora, silDe, silAte, revisaoHora, flashHora].map((i) => minutosDe(i.value));
    if (mins.some((m) => m === null || m === undefined || Number.isNaN(m) || m >= 1440)) { erroPrefs.textContent = 'Preencha os horários no formato 00:00.'; return; }
    const [rMin, pMin, de, ate, revMin, flashMin] = mins;
    if (silencio.c.checked && de === ate) { erroPrefs.textContent = 'O silêncio precisa de horários de início e fim diferentes.'; return; }
    salvar.disabled = true;
    try {
      await estado.alterar('settings', null, {
        notif_antes_min: Number(antes.value), notif_resumo: resumo.c.checked, notif_resumo_min: rMin,
        notif_pendencias: pend.c.checked, notif_pendencias_min: pMin, notif_silencio: silencio.c.checked,
        notif_silencio_de: de, notif_silencio_ate: ate, revisao: revisao.c.checked, revisao_dia: Number(revisaoDia.value), revisao_min: revMin,
        flash_aviso: flash.c.checked, flash_aviso_min: flashMin, fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
      });
      msgPrefs.textContent = 'Salvo.';
    } catch (err) {
      erroPrefs.textContent = err.message || 'Não foi possível salvar.';
    } finally {
      salvar.disabled = false;
    }
  });

  return { el, mostrar() { preencherPrefs(); desenharAparelho(); } };
}
