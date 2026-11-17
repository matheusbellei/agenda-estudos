// Casca do app: login, abas e troca de telas.
const telas = {};
const ABAS = ['hoje', 'semana', 'quadro', 'fixas', 'busca'];
const $ = (s) => document.querySelector(s);

export function registrarTela(nome, { mostrar }) {
  telas[nome] = { mostrar };
}

export function irPara(nome) {
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `tela-${nome}`; });
  document.querySelectorAll('#abas [data-aba]').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === nome));
  if (telas[nome]) telas[nome].mostrar();
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
  ABAS.forEach((a) => $(`[data-aba="${a}"]`).addEventListener('click', () => irPara(a)));
  $('#menu-ajustes').addEventListener('click', () => irPara('ajustes'));

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-erro').textContent = '';
    try {
      const usuario = await store.signIn($('#login-email').value.trim(), $('#login-senha').value);
      await entrar(usuario, aoEntrar);
    } catch (err) {
      $('#login-erro').textContent = err.message || 'Não foi possível entrar.';
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
