// Tela de entrada: a semana atual com o dia de hoje marcado e o botão de mostrar a senha.
import { isoDe, diasDaSemana } from '../regras/datas.js';

const SIGLAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function item(classe, sigla, dia) {
  const li = document.createElement('li');
  if (classe) li.className = classe;
  const s = document.createElement('span'); s.textContent = sigla;
  const b = document.createElement('b'); b.textContent = dia;
  li.append(s, b);
  return li;
}

function textoDoDia(hoje) {
  const t = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(hoje);
  return `Hoje é ${t}.`;
}

export function prepararLogin() {
  const agora = new Date();
  const hoje = isoDe(agora);
  document.querySelector('#login-dia').textContent = textoDoDia(agora);
  document.querySelector('#login-semana').replaceChildren(...diasDaSemana(hoje).map((iso, i) =>
    item(iso === hoje ? 'hoje' : iso < hoje ? 'passou' : '', SIGLAS[i], String(Number(iso.slice(8))))));

  const senha = document.querySelector('#login-senha');
  const ver = document.querySelector('#login-ver-senha');
  ver.addEventListener('click', () => {
    const mostrar = senha.type === 'password';
    senha.type = mostrar ? 'text' : 'password';
    ver.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    ver.setAttribute('aria-pressed', String(mostrar));
    senha.focus();
  });
}
