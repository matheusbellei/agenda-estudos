// Tela Fixas (estudos que se repetem) e a pergunta da virada da semana.
import { registrarTela } from './casca.js';
import { criar, itensOrdenados } from './quadro.js';
import { chipCategoria } from './ajustes.js';
import { mudarEstado } from './bloco.js';
import { ocorrenciasDaSemana, estadoDaOcorrencia, pendenciasDaVirada, levadasVencidas, progresso } from '../regras/fila.js';
import { DIAS_CURTOS, diaDaSemana, inicioDaSemana, somaDias, isoDe } from '../regras/datas.js';
import { registrarTextoNaoSalvo, pedirDescarte } from './folhas.js';

let estado = null;
let abrirCardFn = () => {};
let viradaCamada = null;
let fixaCamada = null;
let fecharVirada = () => {};
// Folha aberta com resposta ou texto ainda não gravado, e como fechá-la pelo fundo ou pelo Esc.
let viradaTemAlgo = () => false;
let fecharViradaPeloFundo = () => {};
let fixaTemTexto = () => false;
let fecharFixaPeloFundo = () => {};

const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const chaveOc = (oc) => `${oc.card_id}|${oc.date}`;
const hoje = () => isoDe(new Date());
const cardPorId = (id) => estado.dados.cards.find((c) => c.id === id);

const ROTULOS = { a_fazer: 'a fazer', agendada: 'agendada', cumprida: 'cumprida', nao_feita: 'não feita', levada: 'levada' };
const GLIFOS = { a_fazer: '', agendada: '', cumprida: '✓', nao_feita: '✕', levada: '→' };

// ---- gravação (usada pela folha da virada e pela tela)

// Cria a linha da ocorrência ou ajusta a que já existe: repetir depois de uma falha não duplica.
async function gravarOcorrencia(oc, status, nota = '') {
  const instead_note = status === 'missed' ? nota.trim() : '';
  const existente = estado.dados.occurrences.find((o) => chaveOc(o) === chaveOc(oc));
  if (!existente) { await estado.criar('occurrences', { card_id: oc.card_id, date: oc.date, status, instead_note }); return; }
  if (existente.status !== status || existente.instead_note !== instead_note) {
    await estado.alterar('occurrences', existente.id, { status, instead_note });
  }
}

// Sessões ainda planejadas dessa ocorrência seguem o desfecho (levada não mexe nelas).
async function ajustarBlocos(oc, status, nota = '') {
  if (status === 'carried') return;
  const planejados = estado.dados.blocks.filter((b) => b.kind === 'study' && b.card_id === oc.card_id
    && b.fixed_date === oc.date && b.status === 'planned');
  for (const b of planejados) await mudarEstado(estado, b, status === 'done' ? 'done' : 'missed', { instead_note: nota });
}

// Ordem que torna a repetição segura: linhas de ocorrência, depois os blocos, e a virada por último.
async function aplicarVirada(respostas, dia) {
  for (const r of respostas) await gravarOcorrencia(r.oc, r.status, r.nota);
  for (const r of respostas) await ajustarBlocos(r.oc, r.status, r.nota);
  await estado.alterar('settings', null, { last_rollover: inicioDaSemana(dia) });
}

const ehFixaAtiva = (c) => Boolean(c?.is_fixed) && !c.archived;

// Levadas que ainda não foram cumpridas (nem por uma sessão cumprida): ficam em "Ficou para trás".
const levadasPendentes = () => estado.dados.occurrences
  .filter((o) => o.status === 'carried' && ehFixaAtiva(cardPorId(o.card_id)))
  .filter((o) => !estado.dados.blocks.some((b) => b.kind === 'study' && b.status === 'done' && b.card_id === o.card_id && b.fixed_date === o.date))
  .sort((a, b) => a.date.localeCompare(b.date) || a.card_id.localeCompare(b.card_id));

const pendencias = (dia) => pendenciasDaVirada({
  cards: estado.dados.cards, occurrences: estado.dados.occurrences, blocks: estado.dados.blocks,
  hoje: dia, ultimaVirada: estado.ajustes().last_rollover,
});

// ---- pergunta da virada

const OPCOES = [['done', 'Cumpri'], ['missed', 'Não fiz'], ['carried', 'Levar para esta semana']];

function campoNota(valor, aoDigitar) {
  const nota = criar('input', { type: 'text', class: 'virada-nota', maxlength: '300', placeholder: 'O que fiz no lugar (opcional)', 'aria-label': 'O que fiz no lugar', autocomplete: 'off' });
  nota.value = valor;
  nota.addEventListener('input', () => aoDigitar(nota.value));
  return nota;
}

function abrirVirada(pend, dia) {
  const erro = criar('div', { id: 'virada-erro', class: 'erro', role: 'alert' });
  const semanas = new Set(pend.perguntar.map((oc) => inicioDaSemana(oc.date))).size;
  const linhas = pend.perguntar.map((oc) => {
    const linha = { oc, resp: null, nota: '' };
    const botoes = OPCOES.map(([resp, texto]) => {
      const b = criar('button', { type: 'button', class: 'btn virada-opcao', 'data-resp': resp, 'aria-pressed': 'false', texto });
      b.addEventListener('click', () => escolher(linha, resp));
      return b;
    });
    const nota = campoNota('', (v) => { linha.nota = v; });
    nota.hidden = true;
    linha.botoes = botoes;
    linha.campoNota = nota;
    linha.el = criar('div', { class: 'virada-linha', 'data-card': oc.card_id, 'data-data': oc.date },
      criar('div', { class: 'virada-quem', texto: `${cardPorId(oc.card_id)?.title ?? ''} · ${dataCurta(oc.date)}` }),
      criar('div', { class: 'virada-opcoes' }, ...botoes), nota);
    return linha;
  });

  function escolher(linha, resp) {
    linha.resp = resp;
    linha.botoes.forEach((b) => {
      const ligado = b.dataset.resp === resp;
      b.classList.toggle('ativo', ligado);
      b.setAttribute('aria-pressed', String(ligado));
    });
    linha.campoNota.hidden = resp !== 'missed';
    erro.textContent = '';
  }

  const todas = (resp) => () => linhas.forEach((l) => escolher(l, resp));
  const naoFeitas = criar('button', { type: 'button', class: 'btn', id: 'virada-todas-nao-feitas', texto: 'Marcar todas como não feitas' });
  const levar = criar('button', { type: 'button', class: 'btn', id: 'virada-levar-todas', texto: 'Levar todas' });
  naoFeitas.addEventListener('click', todas('missed'));
  levar.addEventListener('click', todas('carried'));

  const concluir = criar('button', { type: 'button', class: 'btn btn-principal', id: 'virada-concluir', texto: 'Concluir' });
  const depois = criar('button', { type: 'button', class: 'btn', id: 'virada-depois', texto: 'Depois' });
  let ocupado = false;
  const travar = (sim) => { ocupado = sim; concluir.disabled = sim; depois.disabled = sim; };

  concluir.addEventListener('click', async () => {
    if (ocupado) return;
    const faltam = linhas.filter((l) => !l.resp).length;
    if (faltam) { erro.textContent = faltam === 1 ? 'Falta responder 1 item.' : `Faltam responder ${faltam} itens.`; return; }
    erro.textContent = '';
    travar(true);
    const respostas = [
      ...pend.fecharSozinho.map((oc) => ({ oc, status: 'missed', nota: '' })),
      ...linhas.map((l) => ({ oc: l.oc, status: l.resp, nota: l.nota })),
    ];
    try {
      await aplicarVirada(respostas, dia);
      fecharVirada();
    } catch (err) {
      erro.textContent = err.message || 'Não foi possível gravar. Tente de novo.';
    } finally {
      travar(false);
    }
  });
  depois.addEventListener('click', () => { if (!ocupado) fecharVirada(); });

  // Respostas escolhidas e notas digitadas só são gravadas no "Concluir".
  viradaTemAlgo = () => linhas.some((l) => l.resp || l.nota.trim());
  fecharViradaPeloFundo = () => {
    if (ocupado) return;
    if (viradaTemAlgo()) pedirDescarte(painel, fecharVirada); else fecharVirada();
  };
  const fundo = criar('div', { class: 'menu-fundo' });
  fundo.addEventListener('click', () => fecharViradaPeloFundo());
  const painel = criar('div', { class: 'menu-folha virada-painel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'virada-titulo' },
    criar('h3', { id: 'virada-titulo', texto: 'Ficou para trás' }),
    criar('p', { class: 'suave', texto: `Estas fixas ${semanas > 1 ? 'das últimas semanas' : 'da semana passada'} ficaram sem resposta. O que fazer com cada uma?` }),
    criar('div', { class: 'virada-atalhos' }, naoFeitas, levar),
    criar('div', { class: 'virada-lista' }, ...linhas.map((l) => l.el)),
    erro, criar('div', { class: 'virada-rodape' }, depois, concluir));
  viradaCamada.replaceChildren(fundo, painel);
  viradaCamada.hidden = false;
  document.body.classList.add('sem-rolagem');
  concluir.focus({ preventScroll: true });
}

// Chamada pelo main.js assim que o estado carrega. Devolve true se abriu a pergunta.
export async function verificarVirada({ estado: e, hoje: dia }) {
  if (e) estado = e;
  const pend = pendencias(dia);
  const vencidas = levadasVencidas({ occurrences: estado.dados.occurrences, blocks: estado.dados.blocks, hoje: dia })
    .filter((oc) => ehFixaAtiva(cardPorId(oc.card_id)));
  const fecharSozinho = [...pend.fecharSozinho, ...vencidas];
  if (pend.perguntar.length) { abrirVirada({ perguntar: pend.perguntar, fecharSozinho }, dia); return true; }
  const segunda = inicioDaSemana(dia);
  const linha = estado.dados.settings[0];
  // Sem linha em `settings` só se cria uma havendo fixa com dia: sem ela não há o que perguntar nem fechar.
  const temFixaComDia = estado.dados.cards.some((c) => ehFixaAtiva(c) && (c.fixed_days || []).length);
  if (!fecharSozinho.length && !(linha ? linha.last_rollover !== segunda : temFixaComDia)) return false;
  try {
    await aplicarVirada(fecharSozinho.map((oc) => ({ oc, status: 'missed', nota: '' })), dia);
  } catch (err) {
    // Sem conexão agora: a verificação se repete na próxima abertura.
    console.warn('Virada da semana não gravada:', err);
  }
  return false;
}

// ---- tela

const textoDias = (dias) => {
  if (!dias.length) return 'sem dia';
  if (dias.length === 7) return 'todo dia';
  return [...dias].sort((a, b) => a - b).map((d) => DIAS_CURTOS[d - 1].toLowerCase()).join(', ');
};

function marca(est, classe) {
  return criar('span', { class: `marca ${classe}`, 'data-estado': est, 'aria-hidden': 'true', texto: GLIFOS[est] });
}

export function iniciarFixas({ estado: e, abrirCard }) {
  estado = e;
  abrirCardFn = abrirCard || abrirCardFn;
  const secao = document.querySelector('#tela-fixas');
  const notasAbertas = new Map(); // chave da ocorrência -> texto digitado, enquanto o campo está aberto
  let arquivadasAbertas = false;

  viradaCamada = criar('div', { id: 'folha-virada', class: 'menu-camada', hidden: '' });
  fixaCamada = criar('div', { id: 'folha-fixa', class: 'menu-camada', hidden: '' });
  document.body.append(viradaCamada, fixaCamada);
  fecharVirada = () => {
    viradaCamada.hidden = true;
    viradaCamada.replaceChildren();
    document.body.classList.remove('sem-rolagem');
  };
  const fecharFixa = () => {
    fixaCamada.hidden = true;
    fixaCamada.replaceChildren();
    document.body.classList.remove('sem-rolagem');
  };
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!fixaCamada.hidden) fecharFixaPeloFundo();
    else if (!viradaCamada.hidden) fecharViradaPeloFundo();
  });
  registrarTextoNaoSalvo(() => (!viradaCamada.hidden && viradaTemAlgo()) || (!fixaCamada.hidden && fixaTemTexto()));

  const titulo = criar('h2', { texto: 'Fixas' });
  const nova = criar('button', { type: 'button', class: 'btn btn-principal', id: 'fixas-nova', texto: 'Nova fixa' });
  const erroTela = criar('div', { id: 'fixas-erro', class: 'erro', role: 'alert' });
  const falhas = criar('div', { id: 'fixas-falhas', class: 'fixas-falhas' });
  const falhasDeBloco = new Map(); // chave da ocorrência -> o que repetir quando só o ajuste do bloco falhou
  const atrasadas = criar('section', { id: 'fixas-atrasadas', class: 'fixas-atrasadas', hidden: '' });
  const lista = criar('div', { id: 'fixas-lista', class: 'fixas-lista' });
  const arquivadas = criar('section', { id: 'fixas-arquivadas', class: 'fixas-arquivadas', hidden: '' });
  secao.replaceChildren(criar('div', { class: 'fixas-topo' }, titulo, nova), erroTela, falhas, atrasadas, lista, arquivadas);

  async function tentar(acao) {
    erroTela.textContent = '';
    try { await acao(); } catch (err) { erroTela.textContent = err.message || 'Não foi possível gravar. Tente de novo.'; }
  }

  // A linha da ocorrência já foi gravada; se só o bloco falhar, a tela oferece repetir esse passo.
  async function responderNaTela(oc, status, nota = '') {
    const chave = chaveOc(oc);
    falhasDeBloco.delete(chave);
    await gravarOcorrencia(oc, status, nota);
    try {
      await ajustarBlocos(oc, status, nota);
    } catch (err) {
      falhasDeBloco.set(chave, { oc, status, nota, mensagem: err.message || 'Não foi possível atualizar a sessão agendada.' });
      desenhar();
    }
  }

  function desenharFalhas() {
    falhas.replaceChildren(...[...falhasDeBloco.entries()].map(([chave, f]) => {
      const de_novo = criar('button', { type: 'button', class: 'btn', 'data-acao': 'tentar-de-novo', texto: 'Tentar de novo' });
      de_novo.addEventListener('click', async () => {
        try {
          await ajustarBlocos(f.oc, f.status, f.nota);
          falhasDeBloco.delete(chave);
        } catch (err) {
          f.mensagem = err.message || f.mensagem;
        }
        desenhar();
      });
      return criar('div', { class: 'falha-bloco erro', role: 'alert', 'data-card': f.oc.card_id, 'data-data': f.oc.date },
        criar('span', { texto: `${cardPorId(f.oc.card_id)?.title ?? ''} · ${dataCurta(f.oc.date)}: a resposta foi salva, mas a sessão agendada não foi atualizada. ${f.mensagem}` }),
        de_novo);
    }));
  }

  // Pedido do "o que fiz no lugar" dentro da própria linha, sem janela do navegador.
  function formularioNota(oc, aoConfirmar) {
    const chave = chaveOc(oc);
    const nota = campoNota(notasAbertas.get(chave) || '', (v) => notasAbertas.set(chave, v));
    const confirmar = criar('button', { type: 'button', class: 'btn btn-principal', 'data-confirmar': '', texto: 'Confirmar' });
    const cancelar = criar('button', { type: 'button', class: 'btn', 'data-cancelar': '', texto: 'Cancelar' });
    confirmar.addEventListener('click', () => tentar(async () => { await aoConfirmar(nota.value); notasAbertas.delete(chave); }));
    cancelar.addEventListener('click', () => { notasAbertas.delete(chave); desenhar(); });
    return criar('div', { class: 'nota-form' }, nota, criar('div', { class: 'nota-botoes' }, cancelar, confirmar));
  }

  function linhaOcorrencia(oc, est) {
    const d = diaDaSemana(oc.date);
    const chave = chaveOc(oc);
    const el = criar('div', { class: 'oc', 'data-data': oc.date, 'data-estado': est },
      marca(est, 'oc-marca'),
      criar('span', { class: 'oc-dia', texto: `${DIAS_CURTOS[d - 1]} ${dataCurta(oc.date)}` }),
      criar('span', { class: 'oc-estado', texto: ROTULOS[est] }));
    if (est !== 'a_fazer') return el;
    const cumprida = criar('button', { type: 'button', class: 'btn', 'data-acao': 'cumprida', texto: 'Cumprida' });
    const naoFeita = criar('button', { type: 'button', class: 'btn', 'data-acao': 'nao-feita', texto: 'Não feita' });
    cumprida.addEventListener('click', () => tentar(() => responderNaTela(oc, 'done')));
    naoFeita.addEventListener('click', () => { notasAbertas.set(chave, notasAbertas.get(chave) || ''); desenhar(); });
    el.append(criar('span', { class: 'oc-acoes' }, cumprida, naoFeita));
    if (notasAbertas.has(chave)) el.append(formularioNota(oc, (nota) => responderNaTela(oc, 'missed', nota)));
    return el;
  }

  function historico(card, segunda) {
    const marcas = [];
    for (const inicio of [-28, -21, -14, -7].map((n) => somaDias(segunda, n))) {
      for (const oc of ocorrenciasDaSemana([card], inicio)) {
        const est = estadoDaOcorrencia(oc, estado.dados.occurrences, estado.dados.blocks);
        const m = marca(est, 'hist-marca');
        m.setAttribute('title', `${dataCurta(oc.date)} · ${ROTULOS[est]}`);
        marcas.push(m);
      }
    }
    return marcas.length ? criar('div', { class: 'fixa-historico' }, criar('span', { class: 'suave', texto: 'Antes:' }), ...marcas) : null;
  }

  function linhaFixa(card, segunda) {
    const dias = card.fixed_days || [];
    const ids = estado.dados.card_categories.filter((cc) => cc.card_id === card.id).map((cc) => cc.category_id);
    const categorias = estado.dados.categories.filter((c) => ids.includes(c.id) && !c.archived);
    const abrir = criar('button', { type: 'button', class: 'fixa-abrir', 'aria-label': `Abrir ${card.title}` },
      ...(categorias.length ? [criar('span', { class: 'cartao-chips' }, ...categorias.map(chipCategoria))] : []),
      criar('span', { class: 'fixa-titulo', texto: card.title }),
      criar('span', { class: 'fixa-dias suave', texto: textoDias(dias) }));
    abrir.addEventListener('click', () => abrirCardFn(card.id));
    const el = criar('div', { class: 'fixa', 'data-card': card.id }, abrir);
    const { feitos, total } = progresso(card.id, itensOrdenados(estado));
    if (total) el.append(criar('div', { class: 'fixa-progresso suave', texto: `${feitos} de ${total} itens` }));
    const ocs = ocorrenciasDaSemana([card], segunda);
    if (ocs.length) {
      el.append(criar('div', { class: 'fixa-semana' },
        ...ocs.map((oc) => linhaOcorrencia(oc, estadoDaOcorrencia(oc, estado.dados.occurrences, estado.dados.blocks)))));
    } else if (!dias.length) {
      el.append(criar('div', { class: 'suave', texto: 'Sempre disponível para encaixar.' }));
    }
    const antes = historico(card, segunda);
    if (antes) el.append(antes);
    return el;
  }

  // Pendências da virada que ficaram sem resposta ("Depois") e levadas ainda não cumpridas, uma a uma.
  function desenharAtrasadas(dia) {
    const { perguntar } = pendencias(dia);
    const levadas = levadasPendentes();
    atrasadas.hidden = !perguntar.length && !levadas.length;
    if (atrasadas.hidden) { atrasadas.replaceChildren(); return; }
    const linha = (oc, opcoes, levada) => {
      const chave = chaveOc(oc);
      const el = criar('div', { class: `atrasada virada-linha${levada ? ' atrasada-levada' : ''}`, 'data-card': oc.card_id, 'data-data': oc.date },
        criar('div', { class: 'virada-quem', texto: `${cardPorId(oc.card_id)?.title ?? ''} · ${dataCurta(oc.date)}` }),
        ...(levada ? [criar('div', { class: 'suave', texto: 'Levada para a semana' })] : []),
        criar('div', { class: 'virada-opcoes' }, ...opcoes.map(([resp, texto]) => {
          const b = criar('button', { type: 'button', class: 'btn virada-opcao', 'data-resp': resp, texto });
          b.addEventListener('click', () => {
            if (resp === 'missed') { notasAbertas.set(chave, notasAbertas.get(chave) || ''); desenhar(); return; }
            tentar(() => responderNaTela(oc, resp));
          });
          return b;
        })));
      if (notasAbertas.has(chave)) el.append(formularioNota(oc, (nota) => responderNaTela(oc, 'missed', nota)));
      return el;
    };
    atrasadas.replaceChildren(criar('h3', { texto: 'Ficou para trás' }),
      ...perguntar.map((oc) => linha(oc, OPCOES, false)),
      ...levadas.map((oc) => linha(oc, OPCOES.filter(([r]) => r !== 'carried'), true)));
  }

  function desenharArquivadas(cards) {
    arquivadas.hidden = !cards.length;
    if (!cards.length) { arquivadas.replaceChildren(); return; }
    const alternar = criar('button', { type: 'button', class: 'btn', id: 'fixas-arquivadas-alternar', 'aria-expanded': String(arquivadasAbertas), texto: `Arquivadas (${cards.length})` });
    alternar.addEventListener('click', () => { arquivadasAbertas = !arquivadasAbertas; desenhar(); });
    const itens = criar('div', { id: 'fixas-arquivadas-lista', class: 'fixas-lista' }, ...cards.map((c) => {
      const restaurar = criar('button', { type: 'button', class: 'btn', 'data-acao': 'restaurar', texto: 'Restaurar' });
      restaurar.addEventListener('click', () => tentar(() => estado.alterar('cards', c.id, { archived: false })));
      return criar('div', { class: 'arquivada', 'data-card': c.id },
        criar('span', { class: 'fixa-titulo', texto: c.title }), restaurar);
    }));
    itens.hidden = !arquivadasAbertas;
    arquivadas.replaceChildren(alternar, itens);
  }

  function desenhar() {
    const dia = hoje();
    const segunda = inicioDaSemana(dia);
    const fixas = estado.dados.cards.filter((c) => c.is_fixed);
    const ativas = fixas.filter((c) => !c.archived)
      .sort((a, b) => ((a.fixed_days || []).length ? Math.min(...a.fixed_days) : 8) - ((b.fixed_days || []).length ? Math.min(...b.fixed_days) : 8)
        || a.title.localeCompare(b.title, 'pt-BR'));
    desenharFalhas();
    desenharAtrasadas(dia);
    lista.replaceChildren(...(ativas.length
      ? ativas.map((c) => linhaFixa(c, segunda))
      : [criar('p', { class: 'vazio', texto: 'Nenhuma fixa ainda. Toque em “Nova fixa” para criar a primeira.' })]));
    desenharArquivadas(fixas.filter((c) => c.archived).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')));
  }

  // ---- folha "Nova fixa"
  nova.addEventListener('click', () => {
    const titulo = criar('input', { id: 'fixa-titulo', type: 'text', maxlength: '120', autocomplete: 'off' });
    const cats = new Set();
    const dias = new Set();
    let criada = null; // se só as categorias falharem, tentar de novo não cria outro card
    const erro = criar('div', { id: 'fixa-erro', class: 'erro', role: 'alert' });
    const botaoCategorias = estado.dados.categories.filter((c) => !c.archived)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((c) => {
        const b = criar('button', { type: 'button', class: 'filtro-chip', 'data-cat': c.id, 'aria-pressed': 'false' }, chipCategoria(c));
        b.addEventListener('click', () => {
          if (cats.has(c.id)) cats.delete(c.id); else cats.add(c.id);
          b.classList.toggle('ativo', cats.has(c.id));
          b.setAttribute('aria-pressed', String(cats.has(c.id)));
        });
        return b;
      });
    const botaoDias = DIAS_CURTOS.map((t, i) => {
      const b = criar('button', { type: 'button', class: 'chip', 'data-dia': String(i + 1), 'aria-pressed': 'false', texto: t });
      b.addEventListener('click', () => {
        if (dias.has(i + 1)) dias.delete(i + 1); else dias.add(i + 1);
        b.classList.toggle('ativo', dias.has(i + 1));
        b.setAttribute('aria-pressed', String(dias.has(i + 1)));
      });
      return b;
    });
    const salvar = criar('button', { type: 'button', class: 'btn btn-principal', id: 'fixa-salvar', texto: 'Criar fixa' });
    const cancelar = criar('button', { type: 'button', class: 'btn', id: 'fixa-cancelar', texto: 'Cancelar' });
    cancelar.addEventListener('click', fecharFixa);
    salvar.addEventListener('click', async () => {
      const nome = titulo.value.trim();
      if (!nome) { erro.textContent = 'Escreva o título da fixa.'; titulo.focus(); return; }
      erro.textContent = '';
      salvar.disabled = true;
      try {
        if (!criada) {
          criada = await estado.criar('cards', {
            title: nome, is_fixed: true, fixed_days: [...dias].sort((a, b) => a - b), list_id: null, position: 0, notes: '',
          });
        }
        if (cats.size) await estado.definirCategorias(criada.id, [...cats]);
        fecharFixa();
      } catch (err) {
        erro.textContent = err.message || 'Não foi possível criar a fixa. Tente de novo.';
      } finally {
        salvar.disabled = false;
      }
    });
    fixaTemTexto = () => titulo.value.trim() !== '';
    fecharFixaPeloFundo = () => { if (fixaTemTexto()) pedirDescarte(painel, fecharFixa); else fecharFixa(); };
    const fundo = criar('div', { class: 'menu-fundo' });
    fundo.addEventListener('click', () => fecharFixaPeloFundo());
    const painel = criar('form', { class: 'menu-folha', novalidate: '' },
      criar('h3', { texto: 'Nova fixa' }),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Título' }), titulo),
      ...(botaoCategorias.length ? [criar('div', { class: 'campo' }, criar('span', { texto: 'Categoria' }), criar('div', { class: 'chips', id: 'fixa-categorias' }, ...botaoCategorias))] : []),
      criar('div', { class: 'campo' }, criar('span', { texto: 'Dias da semana (opcional)' }), criar('div', { class: 'dias-fixa', id: 'fixa-dias' }, ...botaoDias)),
      erro, criar('div', { class: 'virada-rodape' }, cancelar, salvar));
    painel.addEventListener('submit', (ev) => ev.preventDefault());
    fixaCamada.replaceChildren(fundo, painel);
    fixaCamada.hidden = false;
    document.body.classList.add('sem-rolagem');
    titulo.focus();
  });

  registrarTela('fixas', { mostrar: desenhar });
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
