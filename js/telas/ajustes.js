// Tela Configurações (id interno "ajustes"): horários do calendário, importação e backup. As tags ficam em telas/tags.js.
import { registrarTela } from './casca.js';
import { montarPainelNotificacoes } from './notificacoes.js';
import { maesPrimeiro } from '../regras/tags.js';
import { paisPrimeiro } from '../regras/baralhos.js';
import { horaTexto, minutosDe, inicioDaSemana, isoDe } from '../regras/datas.js';
import { planoDeImportacao } from '../regras/trello.js';
import { TABELAS } from '../estado.js';
import { temaAtual, aplicarTema } from '../tema.js';

const PALETA = [
  '#6F4E37', '#C68B59', '#B5543A', '#D9822B', '#C9A227', '#8A9A3B', '#5B7A3A', '#2F7D6D',
  '#3A8FA3', '#3E6FB0', '#5A5BA8', '#7A5C8A', '#A5568B', '#C9658A', '#7A5C46', '#3B2416',
];
const CORES = { espresso: '#3B2416', espuma: '#FBF6EF' };

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

const HEX = /^#[0-9a-f]{6}$/i;
// Cor vinda dos dados pode estar estragada; qualquer coisa fora de #RRGGBB cai na primeira da paleta.
const corValida = (cor) => (typeof cor === 'string' && HEX.test(cor) ? cor.toUpperCase() : PALETA[0]);
const normalizar = corValida;

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

// Texto em --espuma ou --espresso, o que der mais contraste com a cor.
export function corDoTexto(cor) {
  return contraste(cor, CORES.espuma) >= contraste(cor, CORES.espresso) ? CORES.espuma : CORES.espresso;
}

const ICONE_OK = /^[a-z0-9-]{1,40}$/;

// `nome` permite mostrar "Mãe › Filha" numa subtag; o ícone (Tabler) entra antes do texto.
// Só vale se for texto: em `lista.map(chipCategoria)` o segundo argumento é o índice.
export function chipCategoria(categoria, nome) {
  if (typeof nome !== 'string') nome = categoria.name;
  const cor = corValida(categoria.color);
  const texto = corDoTexto(cor);
  const chip = criar('span', { class: 'chip chip-categoria' });
  if (ICONE_OK.test(categoria.icon || '')) chip.append(criar('i', { class: `ti ti-${categoria.icon}`, 'aria-hidden': 'true' }));
  chip.append(document.createTextNode(nome));
  chip.style.background = cor;
  chip.style.color = texto;
  return chip;
}

// Cores da paleta (16 por padrão) mais "Outra cor". `aoEscolher` (opcional) é chamado quando a pessoa escolhe.
export function seletorDeCor(valorInicial, aoEscolher = () => {}, paleta = PALETA) {
  let valor = corValida(valorInicial);
  const opcoes = criar('div', { class: 'cor-opcoes' });
  const outra = criar('input', { type: 'color', value: valor.toLowerCase(), 'aria-label': 'Outra cor' });
  const marcar = () => {
    opcoes.querySelectorAll('.cor-opcao').forEach((b) => b.classList.toggle('ativo', b.dataset.cor === valor));
    outra.value = valor.toLowerCase();
  };
  paleta.forEach((cor) => {
    const b = criar('button', { type: 'button', class: 'cor-opcao', 'data-cor': cor, 'aria-label': `Cor ${cor}` });
    b.style.background = cor;
    b.addEventListener('click', () => { valor = cor; marcar(); aoEscolher(valor); });
    opcoes.append(b);
  });
  outra.addEventListener('input', () => { valor = normalizar(outra.value); marcar(); });
  outra.addEventListener('change', () => { valor = normalizar(outra.value); marcar(); aoEscolher(valor); });
  const el = criar('div', { class: 'seletor-cor' }, opcoes, criar('label', { class: 'cor-outra suave' }, 'Outra cor ', outra));
  marcar();
  return { el, valor: () => valor };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Chaves de conflito de cada tabela com `trello_id`.
const CONFLITO = 'owner_id,trello_id';

// Grava o plano na ordem categorias, listas, cards, vínculos, itens, anexos. Reimportar não repete nem altera nada.
export async function importarDoTrello(json, { estado, store }) {
  await estado.carregar();
  const plano = planoDeImportacao(json, estado.dados);
  const idPorTrello = (tabela) => new Map(estado.dados[tabela].filter((l) => l.trello_id).map((l) => [l.trello_id, l.id]));
  const ids = { categories: idPorTrello('categories'), lists: idPorTrello('lists'), cards: idPorTrello('cards') };

  async function gravar(tabela, linhas) {
    if (!linhas.length) return;
    const criadas = await store.upsert(tabela, linhas, CONFLITO);
    if (ids[tabela]) criadas.forEach((l) => ids[tabela].set(l.trello_id, l.id));
  }

  await gravar('categories', plano.categories);
  await gravar('lists', plano.lists.map((l) => ({ ...l })));
  await gravar('cards', plano.cards.map(({ list_trello_id: lista, ...c }) => ({ ...c, list_id: lista ? ids.lists.get(lista) || null : null })));

  const vinculos = plano.cardCategories
    .map((v) => ({ card_id: ids.cards.get(v.card_trello_id), category_id: ids.categories.get(v.category_trello_id) }))
    .filter((v) => v.card_id && v.category_id);
  if (vinculos.length) await store.upsert('card_categories', vinculos, 'card_id,category_id');

  const doCard = ({ card_trello_id: card, ...l }) => ({ ...l, card_id: ids.cards.get(card) });
  await gravar('items', plano.items.map(doCard).filter((l) => l.card_id));
  await gravar('attachments', plano.attachments.map(doCard).filter((l) => l.card_id));

  // Sem isto a primeira abertura depois da importação cobraria as fixas da semana passada.
  if (!estado.ajustes().last_rollover) {
    await estado.alterar('settings', null, { last_rollover: inicioDaSemana(isoDe(new Date())) });
  }
  await estado.carregar();
  return plano.resumo;
}

// ---- backup

const VERSAO_BACKUP = 1;
const NAO_E_BACKUP = 'Este arquivo não é um backup deste app.';
const LOTE = 500;
// Chave de conflito de cada tabela no upsert: só entra o que ainda não existe.
const CONFLITO_BACKUP = { card_categories: 'card_id,category_id', settings: 'owner_id' };
const ehObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// Arquivo do backup: todas as tabelas, sem `owner_id` (quem restaura é sempre quem está logado).
export function gerarBackup(dados) {
  const tabelas = {};
  for (const t of TABELAS) tabelas[t] = (dados[t] || []).map(({ owner_id: _dono, ...linha }) => linha);
  return JSON.stringify({ app: 'agenda-estudos', versao: VERSAO_BACKUP, exportado_em: new Date().toISOString(), tabelas }, null, 2);
}

// Lê e valida o texto antes de gravar qualquer coisa. Devolve só as tabelas conhecidas, sem `owner_id`.
function lerBackup(texto) {
  let json;
  try { json = JSON.parse(texto); } catch { throw new Error(NAO_E_BACKUP); }
  if (!ehObjeto(json) || json.app !== 'agenda-estudos' || typeof json.versao !== 'number' || !ehObjeto(json.tabelas)) throw new Error(NAO_E_BACKUP);
  if (json.versao > VERSAO_BACKUP) throw new Error('Este backup é de uma versão mais nova do app. Atualize o app e tente de novo.');
  const tabelas = {};
  for (const t of TABELAS) {
    const linhas = json.tabelas[t];
    if (linhas === undefined) continue;
    // Sem `id` (ou, nas tabelas de vínculo, sem as duas pontas) a linha seria duplicada a cada restauração.
    const identificada = (l) => (t === 'card_categories' ? typeof l.card_id === 'string' && typeof l.category_id === 'string'
      : t === 'settings' ? true : typeof l.id === 'string' && l.id !== '');
    if (!Array.isArray(linhas) || !linhas.every((l) => ehObjeto(l) && identificada(l))) throw new Error(NAO_E_BACKUP);
    tabelas[t] = linhas.map(({ owner_id: _dono, ...linha }) => linha);
  }
  return tabelas;
}

const NAO_SOMA = 'Este backup não pode ser somado aos dados que já estão nesta conta. Restaure em uma conta vazia, ou na mesma conta de onde o backup saiu.';
// Regras únicas do banco além do `id` (supabase/schema.sql). `card_categories` não tem `id`: a chave é a própria linha.
const UNICAS = {
  categories: [['trello_id']], lists: [['trello_id'], ['is_active'], ['is_done']], cards: [['trello_id']],
  items: [['trello_id']], attachments: [['trello_id']], blocks: [['commitment_id', 'date']], occurrences: [['card_id', 'date']],
  flash_lados: [['flashcard_id', 'lado']], flash_dias: [['data']],
};
const MARCAS = ['is_active', 'is_done'];

// Uma linha nova do backup (id que a conta não tem) bateria numa regra única com uma linha que já existe?
export function backupColide(tabelas, dados) {
  return Object.entries(UNICAS).some(([t, regras]) => {
    const existentes = dados[t] || [];
    const ids = new Set(existentes.map((l) => l.id));
    const novas = (tabelas[t] || []).filter((l) => !ids.has(l.id));
    return regras.some((cols) => {
      const chave = (l) => {
        if (MARCAS.includes(cols[0])) return l[cols[0]] ? 'marcada' : null; // só uma lista com cada marca
        // Nome de modelo é único sem diferenciar maiúsculas nem espaços nas pontas (índice do banco).
        const valor = (c) => (c === 'nome' ? String(l[c]).trim().toLowerCase() : String(l[c]));
        return cols.some((c) => l[c] == null) ? null : JSON.stringify(cols.map(valor));
      };
      const ocupadas = new Set(existentes.map(chave).filter((k) => k !== null));
      return novas.some((l) => { const k = chave(l); return k !== null && ocupadas.has(k); });
    });
  });
}

// Modelo do backup com o nome de outro modelo que já existe (recriado depois do backup): entra como "nome (restaurado)".
export function nomesLivres(linhas, existentes) {
  const chave = (n) => String(n).trim().toLowerCase();
  const ids = new Set(existentes.map((m) => m.id));
  const usados = new Set(existentes.map((m) => chave(m.nome)));
  return linhas.map((l) => {
    if (ids.has(l.id) || !usados.has(chave(l.nome))) { usados.add(chave(l.nome)); return l; }
    let nome = `${String(l.nome).trim()} (restaurado)`;
    for (let i = 2; usados.has(chave(nome)); i += 1) nome = `${String(l.nome).trim()} (restaurado ${i})`;
    usados.add(chave(nome));
    return { ...l, nome };
  });
}

// Só acrescenta o que falta (por id), na ordem de TABELAS. Nunca apaga nem sobrescreve.
// Decide antes de gravar: se o backup não couber nos dados desta conta, nada é gravado.
export async function restaurarBackup(texto, { estado, store }) {
  const tabelas = lerBackup(texto);
  await estado.carregar();
  if (backupColide(tabelas, estado.dados)) throw new Error(NAO_SOMA);
  const inseridos = {};
  for (const t of TABELAS) {
    let linhas = tabelas[t] || [];
    if (t === 'settings' && estado.dados.settings.length) linhas = [];
    if (t === 'categories') linhas = maesPrimeiro(linhas);
    if (t === 'modelos') linhas = nomesLivres(linhas, estado.dados.modelos);
    if (t === 'baralhos') linhas = paisPrimeiro(nomesLivres(linhas, estado.dados.baralhos));
    inseridos[t] = 0;
    for (let i = 0; i < linhas.length; i += LOTE) {
      const criadas = await store.upsert(t, linhas.slice(i, i + LOTE), CONFLITO_BACKUP[t] || 'id');
      inseridos[t] += criadas.length;
    }
  }
  await estado.carregar();
  return { inseridos };
}

export function iniciarAjustes({ estado, store }) {
  const secao = document.querySelector('#tela-ajustes');

  // ---- esqueleto fixo da tela

  const inicio = criar('input', { id: 'aj-inicio', type: 'time' });
  const fim = criar('input', { id: 'aj-fim', type: 'time', title: '00:00 = meia-noite (o dia inteiro)' });
  const faixa = criar('select', { id: 'aj-faixa-semana' }, ...[60, 120, 180, 240].map((m) => criar('option', { value: m, texto: `${m / 60} h` })));
  const fatia = criar('select', { id: 'aj-fatia-dia' }, ...[15, 30, 60].map((m) => criar('option', { value: m, texto: `${m} min` })));
  const erroHor = criar('div', { class: 'erro', id: 'aj-horarios-erro', role: 'alert' });
  const formHor = criar('form', { id: 'aj-horarios-form', novalidate: '' },
    criar('div', { class: 'linha-campos' },
      criar('label', { class: 'campo' }, criar('span', { texto: 'Início do dia' }), inicio),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Fim do dia' }), fim)),
    criar('div', { class: 'linha-campos' },
      criar('label', { class: 'campo' }, criar('span', { texto: 'Faixa da semana' }), faixa),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Divisão do dia' }), fatia)),
    erroHor,
    criar('button', { class: 'btn btn-principal', id: 'aj-horarios-salvar', type: 'submit', texto: 'Salvar horários' }));

  const arquivo = criar('input', { id: 'importar-arquivo', type: 'file', accept: '.json,application/json', 'aria-label': 'Arquivo exportado do Trello' });
  const importarIr = criar('button', { class: 'btn btn-principal', id: 'importar-ir', type: 'button', texto: 'Importar' });
  const resumoEl = criar('div', { id: 'importar-resumo', role: 'status', 'aria-live': 'polite' });
  const cartaoImportar = criar('div', { class: 'cartao', id: 'aj-importar' },
    criar('h2', { texto: 'Importar do Trello' }),
    criar('p', { class: 'suave', texto: 'Escolha o arquivo JSON exportado do quadro. Importar de novo o mesmo arquivo não duplica nada.' }),
    criar('label', { class: 'campo' }, criar('span', { texto: 'Arquivo do Trello' }), arquivo),
    importarIr, resumoEl);

  const baixar = criar('button', { class: 'btn btn-principal', id: 'backup-exportar', type: 'button', texto: 'Exportar backup' });
  const arquivoBackup = criar('input', { id: 'backup-arquivo', type: 'file', accept: '.json,application/json', 'aria-label': 'Arquivo de backup' });
  const restaurarIr = criar('button', { class: 'btn', id: 'backup-importar', type: 'button', texto: 'Importar backup' });
  const resumoBackup = criar('div', { id: 'backup-resumo', role: 'status', 'aria-live': 'polite' });
  const cartaoBackup = criar('div', { class: 'cartao', id: 'aj-backup' },
    criar('h2', { texto: 'Backup' }),
    criar('p', { class: 'suave', texto: 'O arquivo guarda tudo o que foi digitado no app, inclusive as anotações. É gerado neste aparelho e não é enviado a lugar nenhum; guarde-o em local privado. Os arquivos anexados (PDFs, imagens) não entram: só a lista deles.' }),
    baixar,
    criar('label', { class: 'campo' }, criar('span', { texto: 'Restaurar de um backup' }), arquivoBackup),
    criar('p', { class: 'suave', texto: 'Restaure em uma conta vazia ou na mesma conta de onde o backup saiu, e antes de importar o Trello. Restaurar só acrescenta o que está faltando; se o backup não couber nos dados da conta, nada é gravado.' }),
    restaurarIr, resumoBackup);


  const sequenciaMin = criar('input', { id: 'aj-sequencia', type: 'number', min: '5', max: '600', step: '5', inputmode: 'numeric' });
  const erroAcomp = criar('div', { class: 'erro', id: 'aj-acomp-erro', role: 'alert' });
  const salvarAcomp = criar('button', { class: 'btn btn-principal', id: 'aj-acomp-salvar', type: 'button', texto: 'Salvar' });
  const cartaoAcomp = criar('div', { class: 'cartao', id: 'aj-acompanhamento' },
    criar('h2', { texto: 'Acompanhamento' }),
    criar('label', { class: 'campo' }, criar('span', { texto: 'Sequência: mínimo de estudo por dia (minutos)' }), sequenciaMin),
    criar('p', { class: 'suave', texto: 'Um dia entra na sequência quando o estudo cumprido chega a esse mínimo.' }),
    erroAcomp, salvarAcomp);
  salvarAcomp.addEventListener('click', async () => {
    const v = Number(sequenciaMin.value);
    if (!Number.isInteger(v) || v < 5 || v > 600) { erroAcomp.textContent = 'Use de 5 a 600 minutos.'; return; }
    erroAcomp.textContent = '';
    try { await estado.alterar('settings', null, { sequencia_min: v }); } catch (err) { erroAcomp.textContent = err.message || 'Não foi possível salvar.'; }
  });

  const num = (id, min, max) => criar('input', { id, type: 'number', min: String(min), max: String(max), inputmode: 'numeric' });
  const focoMin = num('aj-foco-min', 5, 120); const pausaMin = num('aj-pausa-min', 1, 60);
  const pausaLongaMin = num('aj-pausa-longa-min', 1, 60); const ciclosLonga = num('aj-ciclos-longa', 2, 8);
  const focoSom = criar('input', { type: 'checkbox', id: 'aj-foco-som' });
  const erroFoco = criar('div', { class: 'erro', id: 'aj-foco-erro', role: 'alert' });
  const salvarFoco = criar('button', { class: 'btn btn-principal', id: 'aj-foco-salvar', type: 'button', texto: 'Salvar' });
  const campoN = (rotulo, el) => criar('label', { class: 'campo' }, criar('span', { texto: rotulo }), el);
  const cartaoFoco = criar('div', { class: 'cartao', id: 'aj-foco' },
    criar('h2', { texto: 'Modo foco' }),
    criar('div', { class: 'linha-campos' }, campoN('Foco (min)', focoMin), campoN('Pausa (min)', pausaMin)),
    criar('div', { class: 'linha-campos' }, campoN('Pausa longa (min)', pausaLongaMin), campoN('Ciclos até a pausa longa', ciclosLonga)),
    criar('label', { class: 'campo-check' }, focoSom, criar('span', { texto: 'Som e vibração no fim de cada fase (com o app aberto)' })),
    erroFoco, salvarFoco);
  salvarFoco.addEventListener('click', async () => {
    const v = [focoMin, pausaMin, pausaLongaMin, ciclosLonga].map((i) => Number(i.value));
    const [f, p, l, c] = v;
    const ok = v.every(Number.isInteger) && f >= 5 && f <= 120 && p >= 1 && p <= 60 && l >= 1 && l <= 60 && c >= 2 && c <= 8;
    if (!ok) { erroFoco.textContent = 'Foco de 5 a 120 min, pausas de 1 a 60 e de 2 a 8 ciclos.'; return; }
    erroFoco.textContent = '';
    try { await estado.alterar('settings', null, { foco_min: f, pausa_min: p, pausa_longa_min: l, ciclos_longa: c, foco_som: focoSom.checked }); }
    catch (err) { erroFoco.textContent = err.message || 'Não foi possível salvar.'; }
  });

  // Aparência: Automático (segue o aparelho), Claro ou Escuro, em botões como no controle financeiro.
  const tema = criar('div', { id: 'aj-tema', class: 'chips-escolha', role: 'group', 'aria-label': 'Tema' },
    ...[['auto', 'Automático', 'ti-device-mobile'], ['claro', 'Claro', 'ti-sun'], ['escuro', 'Escuro', 'ti-moon']].map(([v, t, i]) => {
      const b = criar('button', { type: 'button', 'data-tema': v }, criar('i', { class: `ti ${i}`, 'aria-hidden': 'true' }), ` ${t}`);
      b.addEventListener('click', () => { aplicarTema(v); marcarTema(); });
      return b;
    }));
  const marcarTema = () => tema.querySelectorAll('[data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === temaAtual())));
  marcarTema();
  const cartaoTema = criar('div', { class: 'cartao', id: 'aj-aparencia' }, criar('h2', { texto: 'Aparência' }), tema,
    criar('p', { class: 'suave', texto: 'Automático segue o tema do celular ou do computador. A escolha fica guardada neste aparelho.' }));
  const fcNovos = criar('input', { id: 'aj-flash-card-novos', type: 'number', min: '0', max: '999', inputmode: 'numeric' });
  const fcRevisoes = criar('input', { id: 'aj-flash-card-revisoes', type: 'number', min: '0', max: '9999', inputmode: 'numeric' });
  const fcFator = criar('input', { id: 'aj-flash-card-fator', type: 'number', min: '1.3', max: '5', step: '0.1', inputmode: 'decimal' });
  const erroFlash = criar('div', { class: 'erro', id: 'aj-flash-erro', role: 'alert' });
  const salvarFlash = criar('button', { class: 'btn btn-principal', id: 'aj-flash-salvar', type: 'button', texto: 'Salvar' });
  const cartaoFlash = criar('div', { class: 'cartao', id: 'aj-flash' }, criar('h2', { texto: 'Flashcards dos cards' }),
    criar('p', { class: 'suave', texto: 'Limites por dia e fator de cada card (os baralhos do menu têm os seus próprios).' }),
    criar('div', { class: 'linha-campos' },
      criar('label', { class: 'campo' }, criar('span', { texto: 'Novos por dia' }), fcNovos),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Revisões por dia' }), fcRevisoes),
      criar('label', { class: 'campo' }, criar('span', { texto: 'Fator' }), fcFator)),
    erroFlash, salvarFlash);
  salvarFlash.addEventListener('click', async () => {
    const n = Number(fcNovos.value); const r = Number(fcRevisoes.value); const f = Number(fcFator.value);
    const ok = Number.isInteger(n) && n >= 0 && n <= 999 && Number.isInteger(r) && r >= 0 && r <= 9999 && f >= 1.3 && f <= 5;
    if (!ok) { erroFlash.textContent = 'Use de 0 a 999 novos, de 0 a 9999 revisões e um fator de 1,3 a 5.'; return; }
    erroFlash.textContent = '';
    try { await estado.alterar('settings', null, { flash_card_novos_dia: n, flash_card_revisoes_dia: r, flash_card_fator: Math.round(f * 10) / 10 }); }
    catch (err) { erroFlash.textContent = err.message || 'Não foi possível salvar.'; }
  });
  const modelosFixas = criar('input', { type: 'checkbox', id: 'aj-modelos-fixas' });
  const cartaoModelos = criar('div', { class: 'cartao', id: 'aj-modelos' }, criar('h2', { texto: 'Modelos de semana' }),
    criar('label', { class: 'campo-check' }, modelosFixas, criar('span', { texto: 'Modelos incluem os compromissos fixos' })),
    criar('p', { class: 'suave', texto: 'Ao aplicar, um compromisso fixo que já aparece na semana nunca é duplicado.' }));
  modelosFixas.addEventListener('change', () => estado.alterar('settings', null, { modelos_com_fixas: modelosFixas.checked }).catch(() => {
    modelosFixas.checked = !modelosFixas.checked;
  }));

  // Duas abas: Geral (horários, bloco sem card, importação e backup) e Notificações.
  const painelNotif = montarPainelNotificacoes({ estado, store });
  const geral = criar('div', { id: 'aj-geral', class: 'aj-painel' },
    criar('div', { class: 'cartao', id: 'aj-horarios' }, criar('h2', { texto: 'Horários' }), formHor),
    cartaoTema,
    cartaoAcomp,
    cartaoFoco,
    cartaoModelos,
    cartaoFlash,
    cartaoImportar,
    cartaoBackup,
  );
  const abas = criar('div', { id: 'aj-abas', class: 'aj-abas', role: 'tablist' },
    ...[['geral', 'Geral'], ['notificacoes', 'Notificações']].map(([v, t]) => criar('button', { type: 'button', role: 'tab', 'data-aba-ajustes': v, texto: t })));
  let abaAtual = 'geral';
  function mostrarAba(nome) {
    abaAtual = nome;
    geral.hidden = nome !== 'geral';
    painelNotif.el.hidden = nome !== 'notificacoes';
    abas.querySelectorAll('[data-aba-ajustes]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.abaAjustes === nome)));
    if (nome === 'notificacoes') painelNotif.mostrar();
  }
  abas.querySelectorAll('[data-aba-ajustes]').forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.abaAjustes)));
  secao.replaceChildren(abas, geral, painelNotif.el);
  mostrarAba('geral');

  // ---- horários
  function desenharHorarios() {
    const a = estado.ajustes();
    inicio.value = horaTexto(a.day_start_min);
    // O campo de hora não aceita 24:00: o fim à meia-noite aparece como 00:00.
    fim.value = horaTexto(a.day_end_min % 1440);
    faixa.value = String(a.week_slot_min);
    fatia.value = String(a.day_slot_min);
    if (document.activeElement !== sequenciaMin) sequenciaMin.value = String(a.sequencia_min);
    modelosFixas.checked = !!a.modelos_com_fixas;
    if (!cartaoFlash.contains(document.activeElement)) {
      fcNovos.value = String(a.flash_card_novos_dia); fcRevisoes.value = String(a.flash_card_revisoes_dia); fcFator.value = String(Number(a.flash_card_fator));
    }
    if (!cartaoFoco.contains(document.activeElement)) {
      focoMin.value = String(a.foco_min); pausaMin.value = String(a.pausa_min);
      pausaLongaMin.value = String(a.pausa_longa_min); ciclosLonga.value = String(a.ciclos_longa); focoSom.checked = !!a.foco_som;
    }
  }

  formHor.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ini = minutosDe(inicio.value || '');
    const fiBruto = minutosDe(fim.value || '');
    const fi = fiBruto === 0 ? 1440 : fiBruto; // fim 00:00 = meia-noite do fim do dia
    const faixaMin = Number(faixa.value);
    if (Number.isNaN(ini) || Number.isNaN(fi)) { erroHor.textContent = 'Informe o início e o fim do dia.'; return; }
    if (fi - ini < faixaMin) {
      erroHor.textContent = fi <= ini
        ? 'O fim do dia precisa ser depois do início.'
        : 'O dia precisa ter pelo menos uma faixa da semana (escolha uma faixa menor ou amplie o horário).';
      return;
    }
    try {
      await estado.alterar('settings', null, { day_start_min: ini, day_end_min: fi, week_slot_min: faixaMin, day_slot_min: Number(fatia.value) });
      erroHor.textContent = '';
    } catch (err) {
      erroHor.textContent = err.message || 'Não foi possível salvar.';
    }
  });


  function mostrarResumo(r) {
    const novo = r.cards + r.itens + r.categorias + r.listas > 0;
    const linhas = [criar('p', { class: novo ? '' : 'suave', texto: novo
      ? `Importado: ${plural(r.cards, 'card', 'cards')}, ${plural(r.itens, 'item', 'itens')}, ${plural(r.categorias, 'categoria', 'categorias')} e ${plural(r.listas, 'lista', 'listas')} (${plural(r.fixas, 'fixa', 'fixas')} e ${plural(r.arquivados, 'arquivado', 'arquivados')} entre os cards).`
      : 'Nada novo para importar.' })];
    if (r.jaExistiam) linhas.push(criar('p', { class: 'suave', texto: `${plural(r.jaExistiam, 'card já estava', 'cards já estavam')} no app e ficou como está.` }));
    if (r.pendentes.length) {
      linhas.push(
        criar('p', { texto: `O Trello não entrega os arquivos enviados. Anexe à mão (${r.pendentes.length}):` }),
        criar('ul', { class: 'importar-pendentes' }, ...r.pendentes.map((p) => criar('li', { texto: `${p.card} — ${p.arquivo}` }))),
      );
    }
    resumoEl.replaceChildren(...linhas);
  }

  importarIr.addEventListener('click', async () => {
    const escolhido = arquivo.files[0];
    if (!escolhido) { resumoEl.textContent = 'Escolha o arquivo JSON exportado do Trello.'; return; }
    importarIr.disabled = true;
    resumoEl.textContent = 'Importando…';
    try {
      let json;
      try { json = JSON.parse(await escolhido.text()); } catch { json = null; }
      mostrarResumo(await importarDoTrello(json, { estado, store }));
    } catch (err) {
      resumoEl.textContent = err.message || 'Não foi possível importar.';
    } finally {
      importarIr.disabled = false;
    }
  });

  baixar.addEventListener('click', async () => {
    baixar.disabled = true;
    try {
      await estado.carregar();
      const url = URL.createObjectURL(new Blob([gerarBackup(estado.dados)], { type: 'application/json' }));
      const link = criar('a', { href: url, download: `agenda-estudos-${isoDe(new Date())}.json` });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      resumoBackup.textContent = '';
    } catch (err) {
      resumoBackup.textContent = err.message || 'Não foi possível gerar o backup.';
    } finally {
      baixar.disabled = false;
    }
  });

  function mostrarRestauracao({ inseridos }) {
    const nomes = { categories: ['categoria', 'categorias'], lists: ['lista', 'listas'], cards: ['card', 'cards'], card_categories: ['vínculo', 'vínculos'],
      items: ['item', 'itens'], attachments: ['anexo', 'anexos'], commitments: ['compromisso', 'compromissos'], blocks: ['bloco', 'blocos'],
      occurrences: ['ocorrência', 'ocorrências'], modelos: ['modelo de semana', 'modelos de semana'],
      baralhos: ['baralho', 'baralhos'], flashcards: ['flashcard', 'flashcards'], flash_lados: ['lado de flashcard', 'lados de flashcard'],
      flash_dias: ['dia de flashcards', 'dias de flashcards'],
      settings: ['ajuste', 'ajustes'] };
    const partes = TABELAS.filter((t) => inseridos[t]).map((t) => plural(inseridos[t], ...nomes[t]));
    resumoBackup.textContent = partes.length ? `Restaurado: ${partes.join(', ')}.` : 'Nada a restaurar: tudo o que está no arquivo já existe no app.';
  }

  restaurarIr.addEventListener('click', async () => {
    const escolhido = arquivoBackup.files[0];
    if (!escolhido) { resumoBackup.textContent = 'Escolha o arquivo de backup.'; return; }
    restaurarIr.disabled = true;
    resumoBackup.textContent = 'Restaurando…';
    try {
      mostrarRestauracao(await restaurarBackup(await escolhido.text(), { estado, store }));
    } catch (err) {
      const recusa = [NAO_E_BACKUP, NAO_SOMA].includes(err.message) || err.message.startsWith('Este backup é de uma versão');
      resumoBackup.textContent = recusa ? err.message
        : `Não foi possível restaurar tudo: ${err.message || 'erro desconhecido'}. Restaurar de novo nesta conta é seguro: só acrescenta o que está faltando.`;
      if (!recusa) await estado.carregar().catch(() => {});
    } finally {
      restaurarIr.disabled = false;
    }
  });

  function desenhar() {
    desenharHorarios();
  }

  registrarTela('ajustes', { mostrar: () => { desenhar(); mostrarAba(abaAtual); } });
  // Um único ouvinte; só redesenha com a tela à vista (aoMudar não tem como remover).
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
