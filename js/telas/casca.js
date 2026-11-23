// Casca do app: login, abas e troca de telas.
const telas = {};
// Hoje e Semana são as duas visões da página inicial (item Agenda do menu).
const AGENDA = ['hoje', 'semana'];
let ultimaAgenda = 'semana';
const TITULOS = { hoje: 'Agenda', semana: 'Agenda', quadro: 'Quadro', fixas: 'Fixas', busca: 'Busca', tags: 'Tags', dashboards: 'Dashboards', ajustes: 'Configurações' };
const $ = (s) => document.querySelector(s);

export function registrarTela(nome, { mostrar }) {
  telas[nome] = { mostrar };
}

export function irPara(nome) {
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `tela-${nome}`; });
  const naAgenda = AGENDA.includes(nome);
  if (naAgenda) ultimaAgenda = nome;
  const item = naAgenda ? 'agenda' : nome;
  document.querySelectorAll('#menu [data-tela]').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === item));
  const visao = $('#visao');
  visao.hidden = !naAgenda;
  visao.querySelectorAll('[data-visao]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.visao === nome)));
  $('#cabecalho-titulo').textContent = TITULOS[nome] || '';
  abrirMenu(false);
  if (telas[nome]) telas[nome].mostrar();
}

function abrirMenu(abrir) {
  const menu = $('#menu');
  if (!menu) return;
  menu.hidden = !abrir;
  $('#menu-botao').setAttribute('aria-expanded', String(abrir));
}

function mostrarLogin(mensagem = '') {
  $('#app').hidden = true;
  $('#tela-login').hidden = false;
  $('#login-erro').textContent = mensagem;
}

// O app só aparece depois que os dados carregaram; se falhar, o usuário continua no login com o motivo.
async function entrar(usuario, aoEntrar) {
  try {
    await aoEntrar(usuario);
  } catch (err) {
    mostrarLogin(err.message || 'Não foi possível carregar os seus dados.');
    return;
  }
  $('#tela-login').hidden = true;
  $('#app').hidden = false;
  irPara('semana');
}

export async function iniciarCasca({ store, aoEntrar, aoSair }) {
  $('#menu-botao').addEventListener('click', (e) => { e.stopPropagation(); abrirMenu($('#menu').hidden); });
  document.querySelectorAll('#menu [data-tela]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.tela === 'agenda' ? ultimaAgenda : b.dataset.tela)));
  document.querySelectorAll('#visao [data-visao]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.visao)));
  $('#menu-sair').addEventListener('click', () => { abrirMenu(false); store.signOut(); });
  // Fecha tocando fora ou com Esc.
  document.addEventListener('click', (e) => { if (!$('#menu').hidden && !e.target.closest('#cabecalho')) abrirMenu(false); }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#menu').hidden) { abrirMenu(false); $('#menu-botao').focus(); } });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-erro').textContent = '';
    const botao = $('#login-entrar');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
      const usuario = await store.signIn($('#login-email').value.trim(), $('#login-senha').value);
      await entrar(usuario, aoEntrar);
    } catch (err) {
      $('#login-erro').textContent = err.message || 'Não foi possível entrar.';
    } finally {
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });

  store.onAuthChange((usuario) => {
    if (usuario) return;
    mostrarLogin();
    aoSair();
  });

  let usuario = null;
  try {
    usuario = await store.restoreSession();
  } catch (err) {
    mostrarLogin(err.message);
    return;
  }
  if (usuario) await entrar(usuario, aoEntrar);
  else mostrarLogin();
}
