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
  ativado: 'Este aparelho recebe os avisos.',
  desativado: 'Este aparelho não recebe os avisos.',
};

export function montarPainelNotificacoes({ estado, store }) {
  // Quadro de situação deste aparelho (como no controle financeiro): sino, frase e os botões.
  const estadoTexto = criar('strong', { id: 'notif-aparelho-estado', class: 'notif-estado' });
  const sino = criar('i', { class: 'ti ti-bell-off', 'aria-hidden': 'true' });
  const ativar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'notif-ativar', texto: 'Receber neste aparelho' });
  const desativar = criar('button', { type: 'button', class: 'btn', id: 'notif-desativar', texto: 'Parar de receber neste aparelho' });
  const teste = criar('button', { type: 'button', class: 'btn', id: 'notif-teste', texto: 'Enviar teste' });
  const erro = criar('div', { class: 'erro', id: 'notif-erro', role: 'alert' });
  const msg = criar('div', { class: 'suave', id: 'notif-msg', role: 'status' });
  const lista = criar('ul', { id: 'notif-aparelhos', class: 'notif-aparelhos' });
  const verificar = criar('button', { type: 'button', class: 'btn', id: 'notif-verificar' },
    criar('i', { class: 'ti ti-stethoscope', 'aria-hidden': 'true' }), ' Verificar se está tudo funcionando');
  const diagnosticoEl = criar('ul', { id: 'notif-diagnostico', class: 'notif-diagnostico', 'aria-live': 'polite' });

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
  // Dia da revisão em botões Seg a Dom (um só escolhido).
  let revisaoDiaValor = 7;
  const revisaoDia = criar('div', { id: 'notif-revisao-dia', class: 'chips-escolha', role: 'group', 'aria-label': 'Dia da revisão' },
    ...['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((t, i) => {
      const b = criar('button', { type: 'button', 'data-dia': String(i + 1), texto: t });
      b.addEventListener('click', () => { revisaoDiaValor = i + 1; marcarDia(); });
      return b;
    }));
  const marcarDia = () => revisaoDia.querySelectorAll('[data-dia]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.dia) === revisaoDiaValor)));
  const revisaoHora = hora('notif-revisao-hora');
  const camposRevisao = criar('div', {}, criar('div', { class: 'campo' }, criar('span', { texto: 'Dia' }), revisaoDia), campo('Horário', revisaoHora));
  const revisaoNoSilencio = criar('p', { class: 'erro', id: 'notif-revisao-no-silencio', hidden: '',
    texto: 'Este horário cai no horário de silêncio: o aviso da revisão não vai chegar. Escolha outro horário ou mude o silêncio.' });
  const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'notif-salvar', texto: 'Salvar' });
  const erroPrefs = criar('div', { class: 'erro', id: 'notif-prefs-erro', role: 'alert' });
  const msgPrefs = criar('div', { class: 'suave', id: 'notif-prefs-msg', role: 'status' });

  const el = criar('div', { id: 'aj-notificacoes', class: 'aj-painel' },
    criar('div', { class: 'cartao', id: 'notif-este' },
      criar('h2', { texto: 'Avisos neste aparelho' }),
      criar('p', { class: 'suave', texto: 'Ative em cada aparelho onde quer receber os avisos (celular e computador). Funciona com o app fechado.' }),
      criar('div', { class: 'notif-status', id: 'notif-status' },
        criar('p', { class: 'notif-status-linha' }, sino, estadoTexto),
        criar('div', { class: 'linha-botoes' }, ativar, desativar, teste)),
      erro, msg,
      // Aparelhos e verificação ficam recolhidos: abre quando precisar.
      criar('details', { class: 'notif-mais', id: 'notif-mais' }, criar('summary', { texto: 'Aparelhos e verificação' }),
        criar('h3', { class: 'sub', texto: 'Aparelhos ativos' }), lista,
        criar('h3', { class: 'sub', texto: 'Funcionamento' }),
        criar('p', { class: 'suave', texto: 'Confere tudo o que os avisos precisam para chegar com o app fechado e diz o que fazer se algo estiver errado.' }),
        criar('div', { class: 'linha-botoes' }, verificar), diagnosticoEl)),
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
      criar('p', { class: 'notif-aviso', id: 'notif-silencio-aviso', texto: 'Com o silêncio ligado, você não recebe nenhum aviso nesse intervalo — nem lembretes, nem resumo, nem pendências, nem a revisão da semana, nem os flashcards do dia. O que cair nele é descartado, não chega depois.' }),
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
    revisao.c.checked = a.revisao; revisaoDiaValor = Number(a.revisao_dia) || 7; marcarDia(); revisaoHora.value = horaTexto(a.revisao_min);
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
    el.querySelector('#notif-status').dataset.estado = atual.estado;
    sino.className = `ti ${atual.estado === 'ativado' ? 'ti-bell-ringing' : 'ti-bell-off'}`;
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

  // ---- Verificar: o que o app vê (permissão, este aparelho) + o que a função vê (chaves, banco, agendador, entregas).
  const tempo = (s) => (s < 90 ? `${s} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${Math.round(s / 3600)} h`);
  function itensDoDiagnostico(local, { http, dados }) {
    const itens = [];
    const item = (chave, ok, texto) => itens.push({ chave, ok, texto });
    if (local.estado === 'ativado') item('aparelho', 'sim', 'Este aparelho está ativado e com permissão para notificações.');
    else item('aparelho', 'nao', `${TEXTO_ESTADO[local.estado] || 'Este aparelho não está ativado.'}${local.estado === 'desativado' ? ' Toque em "Ativar neste aparelho".' : ''}`);
    if (http === 0) { item('funcao', 'nao', 'A função "lembretes" não respondeu. Confira em Edge Functions se ela existe com esse nome e se tem internet.'); return itens; }
    if (http === 404 || (http === 200 && !dados?.chaves)) { item('funcao', 'nao', 'A função "lembretes" está com o código antigo: cole o index.ts novo em Edge Functions → lembretes e clique em Deploy.'); return itens; }
    if (http === 401) { item('funcao', 'nao', 'Sua sessão venceu: saia e entre no app de novo.'); return itens; }
    if (http !== 200) { item('funcao', 'nao', `A função respondeu ${http}${dados?.erro ? `: ${dados.erro}` : ''}.`); return itens; }
    item('funcao', 'sim', 'A função "lembretes" respondeu.');
    const c = dados.chaves;
    if (!c.publica || !c.privada) item('chaves', 'nao', `Falta o segredo ${!c.publica ? 'VAPID_PUBLIC_KEY' : 'VAPID_PRIVATE_KEY'} em Edge Functions → Secrets.`);
    else if (!c.publicaIgual) item('chaves', 'nao', 'A chave pública da função (segredo VAPID_PUBLIC_KEY) é diferente da do app (js/config.js). Deixe as duas iguais e, depois, desative e ative este aparelho.');
    else item('chaves', 'sim', 'As chaves das notificações da função e do app são as mesmas.');
    if (!c.segredo) item('segredo', 'nao', 'Falta o segredo LEMBRETES_SEGREDO em Edge Functions → Secrets (o agendador não consegue chamar a função).');
    if (dados.banco !== 'ok') item('banco', 'nao', `A função não consegue ler o banco (${dados.banco}). Rode supabase/migracao-2026-11-servico.sql no SQL Editor.`);
    else item('banco', 'sim', 'A função lê o banco.');
    const a = dados.agendador;
    const erroDepois = a.ultimoErro && a.erroEm && (!a.ultimoTique || a.erroEm > a.ultimoTique);
    if (a.segundosDesdeUltimo === null) item('agendador', 'nao', `O agendador ainda não chamou a função${erroDepois ? ` (último erro: ${a.ultimoErro})` : ''}. Rode supabase/agendar-lembretes.sql e a migração migracao-2026-11-diagnostico.sql.`);
    else if (a.segundosDesdeUltimo > 180) item('agendador', 'nao', `O agendador não roda há ${tempo(a.segundosDesdeUltimo)}${erroDepois ? ` — último erro: ${a.ultimoErro}` : ''}. Confira em Integrations → Cron se "lembretes-a-cada-minuto" está ativo.`);
    else if (erroDepois) item('agendador', 'nao', `O agendador rodou há ${tempo(a.segundosDesdeUltimo)}, mas deu erro: ${a.ultimoErro}`);
    else item('agendador', 'sim', `O agendador rodou há ${tempo(a.segundosDesdeUltimo)} (roda a cada minuto).`);
    const ap = dados.aparelho;
    if (local.estado === 'ativado' && !ap.ativado) item('entrega', 'nao', 'A função não encontra este aparelho: desative e ative de novo.');
    else if (ap.ativado && ap.ultimoStatus === null) item('entrega', 'aviso', 'Este aparelho ainda não recebeu nenhum aviso. Toque em "Enviar teste".');
    else if (ap.ativado) {
      const problema = aparelho.explicarStatusDoPush(ap.ultimoStatus);
      if (problema) item('entrega', 'nao', problema);
      else item('entrega', 'sim', `O último aviso foi aceito para este aparelho${ap.ultimoOk ? ` (${new Date(ap.ultimoOk).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''}.`);
    }
    return itens;
  }
  verificar.addEventListener('click', async () => {
    if (verificar.disabled) return;
    verificar.disabled = true;
    diagnosticoEl.replaceChildren(criar('li', { class: 'suave', texto: 'Verificando…' }));
    try {
      let linhas = [];
      try { linhas = await aparelho.aparelhos(store); } catch { /* segue com a lista vazia */ }
      const local = await aparelho.estadoDoAparelho(store, linhas).catch(() => ({ estado: 'desativado' }));
      const remoto = await aparelho.diagnosticar(store, local.endpoint);
      const icone = { sim: 'ti-circle-check', nao: 'ti-alert-circle', aviso: 'ti-info-circle' };
      diagnosticoEl.replaceChildren(...itensDoDiagnostico(local, remoto).map((i) => criar('li', { 'data-item': i.chave, 'data-ok': i.ok },
        criar('i', { class: `ti ${icone[i.ok]}`, 'aria-hidden': 'true' }), criar('span', { texto: i.texto }))));
    } catch (err) {
      diagnosticoEl.replaceChildren(criar('li', { 'data-item': 'erro', 'data-ok': 'nao', texto: err.message || 'Não deu para verificar.' }));
    } finally { verificar.disabled = false; }
  });

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
        notif_silencio_de: de, notif_silencio_ate: ate, revisao: revisao.c.checked, revisao_dia: revisaoDiaValor, revisao_min: revMin,
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
