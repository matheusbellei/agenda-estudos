// Tela Ajustes: categorias, horários do calendário, importação/backup (tarefas futuras) e sair.
import { registrarTela } from './casca.js';
import { horaTexto, minutosDe, inicioDaSemana, isoDe } from '../regras/datas.js';
import { planoDeImportacao } from '../regras/trello.js';
import { TABELAS } from '../estado.js';

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

export function chipCategoria(categoria) {
  const cor = corValida(categoria.color);
  const texto = corDoTexto(cor);
  const chip = criar('span', { class: 'chip chip-categoria', texto: categoria.name });
  chip.style.background = cor;
  chip.style.color = texto;
  return chip;
}

// 16 cores da paleta mais "Outra cor". `aoEscolher` (opcional) é chamado quando a pessoa escolhe.
export function seletorDeCor(valorInicial, aoEscolher = () => {}) {
  let valor = corValida(valorInicial);
  const opcoes = criar('div', { class: 'cor-opcoes' });
  const outra = criar('input', { type: 'color', value: valor.toLowerCase(), 'aria-label': 'Outra cor' });
  const marcar = () => {
    opcoes.querySelectorAll('.cor-opcao').forEach((b) => b.classList.toggle('ativo', b.dataset.cor === valor));
    outra.value = valor.toLowerCase();
  };
  PALETA.forEach((cor) => {
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
        return cols.some((c) => l[c] == null) ? null : JSON.stringify(cols.map((c) => String(l[c])));
      };
      const ocupadas = new Set(existentes.map(chave).filter((k) => k !== null));
      return novas.some((l) => { const k = chave(l); return k !== null && ocupadas.has(k); });
    });
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
  const formCat = criar('form', { id: 'aj-cat-form', novalidate: '' });
  const nomeCat = criar('input', { id: 'aj-cat-nome', type: 'text', placeholder: 'Nome da categoria', autocomplete: 'off' });
  const corNova = seletorDeCor(PALETA[0]);
  const erroCat = criar('div', { class: 'erro', id: 'aj-cat-erro', role: 'alert' });
  formCat.append(
    criar('label', { class: 'campo' }, criar('span', { texto: 'Nova categoria' }), nomeCat),
    corNova.el,
    erroCat,
    criar('button', { class: 'btn btn-principal', id: 'aj-cat-criar', type: 'submit', texto: 'Criar categoria' }),
  );
  const listaCat = criar('div', { id: 'aj-cat-lista' });
  const arquivadas = criar('div', { id: 'aj-cat-arquivadas' });

  const inicio = criar('input', { id: 'aj-inicio', type: 'time' });
  const fim = criar('input', { id: 'aj-fim', type: 'time' });
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

  const sair = criar('button', { class: 'btn', id: 'aj-sair-btn', type: 'button', texto: 'Sair da conta' });

  secao.replaceChildren(
    criar('div', { class: 'cartao', id: 'aj-categorias' }, criar('h2', { texto: 'Categorias' }), formCat, listaCat,
      criar('h3', { class: 'sub', texto: 'Arquivadas' }), arquivadas),
    criar('div', { class: 'cartao', id: 'aj-horarios' }, criar('h2', { texto: 'Horários' }), formHor),
    cartaoImportar,
    cartaoBackup,
    criar('div', { class: 'cartao', id: 'aj-sair' }, sair),
  );

  // ---- categorias
  const nomeJaExiste = (nome, exceto = null) => estado.dados.categories
    .some((c) => c.id !== exceto && c.name.trim().toLowerCase() === nome.toLowerCase());

  // Devolve a mensagem de recusa, ou '' se o nome serve.
  function validarNome(nome, exceto) {
    if (!nome) return 'Dê um nome à categoria.';
    if (nomeJaExiste(nome, exceto)) return 'Já existe uma categoria com esse nome.';
    return '';
  }

  async function gravar(acao) {
    try { await acao(); erroCat.textContent = ''; } catch (err) { erroCat.textContent = err.message || 'Não foi possível salvar.'; }
  }

  formCat.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = nomeCat.value.trim();
    erroCat.textContent = validarNome(nome, null);
    if (erroCat.textContent) return;
    await gravar(async () => {
      await estado.criar('categories', { name: nome, color: corNova.valor() });
      nomeCat.value = '';
    });
  });

  function linhaCategoria(cat) {
    const nome = criar('input', { class: 'cat-nome', type: 'text', value: cat.name, 'aria-label': 'Nome da categoria' });
    const renomear = async () => {
      const novo = nome.value.trim();
      if (novo === cat.name) { erroCat.textContent = ''; return; }
      erroCat.textContent = validarNome(novo, cat.id);
      if (erroCat.textContent) return;
      await gravar(() => estado.alterar('categories', cat.id, { name: novo }));
    };
    nome.addEventListener('change', renomear);
    nome.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); renomear(); } });
    const cor = seletorDeCor(cat.color, (c) => gravar(() => estado.alterar('categories', cat.id, { color: c })));
    const bolinha = criar('span', { class: 'cor-bolinha' });
    bolinha.style.background = cat.color;
    const arquivar = criar('button', { class: 'btn', type: 'button', 'data-acao': 'arquivar', texto: 'Arquivar' });
    arquivar.addEventListener('click', () => gravar(() => estado.alterar('categories', cat.id, { archived: true })));
    return criar('div', { class: 'cat-linha' },
      criar('div', { class: 'cat-topo' },
        criar('details', { class: 'cat-cor' }, criar('summary', { 'aria-label': 'Trocar cor' }, bolinha), cor.el),
        nome, arquivar));
  }

  function linhaArquivada(cat) {
    const desarquivar = criar('button', { class: 'btn', type: 'button', 'data-acao': 'desarquivar', texto: 'Desarquivar' });
    desarquivar.addEventListener('click', () => gravar(() => estado.alterar('categories', cat.id, { archived: false })));
    return criar('div', { class: 'cat-arquivada' }, chipCategoria(cat), desarquivar);
  }

  function desenharCategorias() {
    const ordenadas = [...estado.dados.categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const ativas = ordenadas.filter((c) => !c.archived);
    const arquivadasLista = ordenadas.filter((c) => c.archived);
    listaCat.replaceChildren(...(ativas.length ? ativas.map(linhaCategoria) : [criar('p', { class: 'vazio', texto: 'Nenhuma categoria ainda.' })]));
    arquivadas.replaceChildren(...(arquivadasLista.length ? arquivadasLista.map(linhaArquivada) : [criar('p', { class: 'suave', texto: 'Nenhuma categoria arquivada.' })]));
  }

  // ---- horários
  function desenharHorarios() {
    const a = estado.ajustes();
    inicio.value = horaTexto(a.day_start_min);
    fim.value = horaTexto(a.day_end_min);
    faixa.value = String(a.week_slot_min);
    fatia.value = String(a.day_slot_min);
  }

  formHor.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ini = minutosDe(inicio.value || '');
    const fi = minutosDe(fim.value || '');
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

  sair.addEventListener('click', () => store.signOut());

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
      occurrences: ['ocorrência', 'ocorrências'], settings: ['ajuste', 'ajustes'] };
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
    desenharCategorias();
    desenharHorarios();
  }

  registrarTela('ajustes', { mostrar: desenhar });
  // Um único ouvinte; só redesenha com a tela à vista (aoMudar não tem como remover).
  estado.aoMudar(() => { if (!secao.hidden) desenhar(); });
}
