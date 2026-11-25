// Janela por cima das telas (mesmo jeito da janela de tags): fundo que fecha, painel com título.
import { criar } from './bloco.js';

export function abrirJanela(id, titulo, ...conteudo) {
  document.querySelector(`#${id}`)?.remove();
  const janela = criar('div', { id, class: 'menu-camada janela-extra' });
  const fundo = criar('div', { class: 'menu-fundo' });
  const painel = criar('form', { class: 'menu-folha tag-painel', novalidate: '' }, criar('h3', { texto: titulo }), ...conteudo);
  painel.addEventListener('submit', (e) => e.preventDefault());
  janela.append(fundo, painel);
  document.body.append(janela);
  const tinhaSemRolagem = document.body.classList.contains('sem-rolagem');
  document.body.classList.add('sem-rolagem');
  const aoEsc = (e) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); fechar(); } };
  const api = { janela, painel, fechar, aoFechar: null };
  function fechar() {
    api.aoFechar?.();
    janela.remove();
    document.removeEventListener('keydown', aoEsc, true);
    if (!tinhaSemRolagem) document.body.classList.remove('sem-rolagem');
  }
  fundo.addEventListener('click', fechar);
  document.addEventListener('keydown', aoEsc, true);
  return api;
}
